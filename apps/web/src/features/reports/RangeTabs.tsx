import Chip from '@mui/material/Chip';

export const RANGES = [7, 30, 90] as const;

export function RangeTabs({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Report period">
      {RANGES.map((d) => (
        <Chip key={d} label={`Last ${d} days`} clickable color={value === d ? 'primary' : 'default'} variant={value === d ? 'filled' : 'outlined'} onClick={() => onChange(d)} aria-pressed={value === d} />
      ))}
    </div>
  );
}

export const readable = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
