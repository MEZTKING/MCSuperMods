/** The chain of passes, run on a still frame where it can be (ADR 0121; B620 stub, B629 builds it). */

import { NotYet } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';

export default function PostEffectView(_props: LiveViewProps) {
  return <NotYet title="Post effect" brief="B629" />;
}
