import * as Switch from '@radix-ui/react-switch';
import { cn } from '../lib/cn';

export function Toggle({
  checked,
  onCheckedChange,
  label,
  disabled
}: {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border border-transparent transition-colors',
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]',
        disabled && 'opacity-50'
      )}
    >
      <Switch.Thumb className="block size-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[22px]" />
    </Switch.Root>
  );
}
