import { useState } from 'react';

export default function SearchPanel() {
  const [text, setText] = useState('');
  return (
    <div role="combobox" aria-expanded="false" aria-controls="b650-results">
      <input aria-label="What do you want to make?" value={text} onChange={(e) => setText(e.target.value)} />
      <div id="b650-results" role="listbox" />
      <div role="status" aria-live="polite" />
    </div>
  );
}
