export interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
}

export function MultiSelectButtonGroup<T extends string>({ label, options, value, onChange, className = "" }: {
  label: string;
  options: MultiSelectOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  className?: string;
}) {
  return <div className={`multi-select-filter ${className}`.trim()} role="group" aria-label={label}>
    <span className="multi-select-filter__label">{label}</span>
    <div className="multi-select-filter__buttons">
      <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])}>Alle</button>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(selected ? value.filter((item) => item !== option.value) : [...value, option.value])}>{option.label}</button>;
      })}
    </div>
  </div>;
}
