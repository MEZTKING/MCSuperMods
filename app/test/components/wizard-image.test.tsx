// @vitest-environment happy-dom
import type { ProjectStarter, StarterParameter, TargetFacts } from '@msm/plugin-api';
import { encodePng, libraryStarters } from '@msm/plugin-library';
import { builtInTargets, targetFacts } from '@msm/targets';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParameterField } from '../../src/renderer/src/components/wizard/ParameterField';
import { StarterWizard } from '../../src/renderer/src/components/wizard/StarterWizard';
import {
  bytesOfPngDataUrl,
  checkPngBytes,
  DEFAULT_IMAGE_MAX_BYTES,
  defaultRawValue,
  defaultRawValues,
  imageSummary,
  pngDataUrl,
  pngSize,
  type RawValue,
  type RawValues,
  readImageFile,
  stepErrors,
  toValue,
  toValues,
  validateParameter,
  wizardSteps,
} from '../../src/renderer/src/components/wizard/wizard-model';
import { fakeStarter } from './library-fixtures';

afterEach(cleanup);

const IMAGE: StarterParameter & { type: 'image' } = {
  id: 'image',
  label: 'Picture',
  group: 'Picture',
  type: 'image',
  default: null,
  maxBytes: 4096,
  maxSize: 32,
};

/** An opaque grey PNG of the given size. */
const png = (width: number, height: number): Uint8Array =>
  encodePng(new Uint8Array(width * height * 4).fill(128), width, height);

/** A picked file holding `bytes`. */
const fileOf = (bytes: Uint8Array, name = 'picture.png', type = 'image/png'): File =>
  new File([new Uint8Array(bytes)], name, { type });

describe('image parameters in the wizard model (ADR 0044 D7)', () => {
  it('starts with no image and converts it to null', () => {
    expect(defaultRawValue(IMAGE)).toBe('');
    expect(validateParameter(IMAGE, '')).toBeNull();
    expect(toValue(IMAGE, '')).toBeNull();
    expect(toValues([IMAGE], defaultRawValues([IMAGE]))).toEqual({ image: null });
  });

  it('round-trips PNG bytes through a data URL and reads the size', () => {
    const bytes = png(16, 8);
    const url = pngDataUrl(bytes);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(bytesOfPngDataUrl(url)).toEqual(bytes);
    expect(pngSize(bytes)).toEqual({ width: 16, height: 8 });
    expect(validateParameter(IMAGE, url)).toBeNull();
    expect(toValue(IMAGE, url)).toBe(url);
    expect(imageSummary(url)).toBe('PNG image, 16 by 8 pixels');
    expect(imageSummary(null)).toBe('None');
  });

  it('checks the signature, the byte limit and the pixel limit', () => {
    expect(checkPngBytes(IMAGE, new Uint8Array(40))).toBe('Choose a PNG image.');
    expect(checkPngBytes(IMAGE, png(16, 16))).toBeNull();
    expect(checkPngBytes(IMAGE, png(33, 8))).toBe('Choose an image of at most 32 by 32 pixels.');
    expect(checkPngBytes({ ...IMAGE, maxSize: 64 }, png(40, 40))).toBe(
      'Choose an image of at most 4 KB.',
    );
    const { maxBytes: _bytes, maxSize: _size, ...unlimited } = IMAGE;
    expect(DEFAULT_IMAGE_MAX_BYTES).toBe(1_048_576);
    expect(checkPngBytes(unlimited, png(200, 200))).toBeNull();
    expect(validateParameter(IMAGE, 'data:image/jpeg;base64,AAAA')).toBe('Choose a PNG image.');
    expect(validateParameter(IMAGE, true)).toBe('Choose a PNG image.');
    expect(toValue(IMAGE, pngDataUrl(png(64, 64)))).toBeNull();
  });

  it('reads a picked file into a value or an error', async () => {
    expect(await readImageFile(IMAGE, fileOf(png(8, 8)))).toEqual({ value: pngDataUrl(png(8, 8)) });
    expect(await readImageFile(IMAGE, fileOf(new Uint8Array(64), 'a.png'))).toEqual({
      error: 'Choose a PNG image.',
    });
    expect(await readImageFile(IMAGE, fileOf(new Uint8Array(5000)))).toEqual({
      error: 'Choose an image of at most 4 KB.',
    });
  });

  it('accepts the Painting flow with no image and puts the picture on its own step', () => {
    const painting = libraryStarters.find((starter) => starter.id === 'painting');
    const parameters = painting?.parameters ?? [];
    expect(wizardSteps(parameters).map((step) => step.title)).toEqual(['Painting', 'Picture']);
    expect(stepErrors(parameters, defaultRawValues(parameters))).toEqual({});
    expect(toValues(parameters, defaultRawValues(parameters)).image).toBeNull();
    const image = parameters.find((parameter) => parameter.type === 'image');
    expect(image).toMatchObject({ maxBytes: 1_048_576, maxSize: 256 });
  });
});

describe('ParameterField for an image', () => {
  function Field(props: { onChange?(value: RawValue): void }) {
    const [value, setValue] = useState<RawValue>(defaultRawValue(IMAGE));
    return (
      <ParameterField
        parameter={IMAGE}
        value={value}
        error={null}
        onChange={(next) => {
          setValue(next);
          props.onChange?.(next);
        }}
      />
    );
  }

  it('picks a PNG, shows its thumbnail and removes it again', async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const input = screen.getByTestId('param-image') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/png');
    expect(screen.getByLabelText('Picture')).toBe(input);
    expect(screen.getByTestId('param-image-empty').textContent).toBe('No image');
    await userEvent.upload(input, fileOf(png(8, 8)));
    await waitFor(() => expect(screen.getByTestId('param-image-thumbnail')).toBeTruthy());
    expect(onChange).toHaveBeenLastCalledWith(pngDataUrl(png(8, 8)));
    expect(screen.getByTestId('param-image-thumbnail').getAttribute('src')).toBe(
      pngDataUrl(png(8, 8)),
    );
    await userEvent.click(screen.getByTestId('param-image-clear'));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByTestId('param-image-empty')).toBeTruthy();
  });

  it('shows why a file is refused and keeps the previous value', async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const input = screen.getByTestId('param-image') as HTMLInputElement;
    await userEvent.upload(input, fileOf(png(40, 8)));
    await waitFor(() =>
      expect(screen.getByTestId('param-image-error').textContent).toBe(
        'Choose an image of at most 32 by 32 pixels.',
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    await userEvent.upload(input, fileOf(png(8, 8)));
    await waitFor(() => expect(screen.queryByTestId('param-image-error')).toBeNull());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('StarterWizard with an image', () => {
  const facts: TargetFacts[] = builtInTargets.map(
    (bundle) => targetFacts(bundle.target.id) as TargetFacts,
  );
  const starter: ProjectStarter = {
    ...fakeStarter,
    id: 'image_wizard',
    title: 'Image wizard',
    parameters: [IMAGE],
  };

  function Harness(props: { onCreate(values: RawValues): void }) {
    const [values, setValues] = useState<RawValues>(defaultRawValues(starter.parameters));
    const [targetId, setTargetId] = useState(facts[0]?.id ?? '');
    return (
      <StarterWizard
        starter={starter}
        targets={facts}
        targetId={targetId}
        onTargetChange={setTargetId}
        values={values}
        onValuesChange={setValues}
        onCancel={() => {}}
        onCreate={() => props.onCreate(values)}
      />
    );
  }

  it('summarises no image as None and a picked image by its size', async () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);
    await userEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-summary').textContent).toContain('None');
    await userEvent.click(screen.getByTestId('wizard-back'));
    await userEvent.upload(screen.getByTestId('param-image'), fileOf(png(16, 16)));
    await waitFor(() => expect(screen.getByTestId('param-image-thumbnail')).toBeTruthy());
    await userEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-summary').textContent).toContain(
      'PNG image, 16 by 16 pixels',
    );
    await userEvent.click(screen.getByTestId('wizard-create'));
    expect(onCreate).toHaveBeenCalledWith({ image: pngDataUrl(png(16, 16)) });
  });
});
