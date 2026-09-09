export interface SingleSelectOption<T extends string> {
  value: T;
  label: string;
}

export function SingleSelectButtonGroup<T extends string>({ label, options, value, onChange, className = "" }: {
  label: string;
  options: SingleSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return <fieldset className={`single-select-field ${className}`.trim()}>
    <legend>{label}</legend>
    <div className="single-select-field__buttons">
      {options.map((option) => <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
      >{option.label}</button>)}
    </div>
  </fieldset>;
}
