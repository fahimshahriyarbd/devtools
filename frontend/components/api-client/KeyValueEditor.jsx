'use client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small reusable key/value editor used by Params, Headers, Form-Data
// and URL-Encoded bodies. Rows can be enabled/disabled with a switch,
// and typing in the last row auto-appends a new empty row — same UX
// convention Postman uses so users never hit a “no more room” wall.
export default function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  extraColumn,
  showEnabled = true,
  compact = false,
  testIdPrefix = 'kv',
}) {
  const setRows = (next) => onChange(next);
  const updateRow = (id, patch) => {
    let next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    // Auto-append blank trailing row when the user edits the last one.
    const last = next[next.length - 1];
    if (last && (last.key || last.value)) {
      next = [...next, { id: crypto.randomUUID(), key: '', value: '', enabled: true, ...(extraColumn ? { type: 'text' } : {}) }];
    }
    setRows(next);
  };
  const removeRow = (id) => {
    let next = rows.filter((r) => r.id !== id);
    if (next.length === 0) next = [{ id: crypto.randomUUID(), key: '', value: '', enabled: true, ...(extraColumn ? { type: 'text' } : {}) }];
    setRows(next);
  };
  return (
    <div className="space-y-1">
      <div className={cn('grid gap-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground', extraColumn ? 'grid-cols-[20px_44px_1fr_1fr_90px_32px]' : 'grid-cols-[20px_44px_1fr_1fr_32px]')}>
        <span />
        {showEnabled ? <span>On</span> : <span />}
        <span>{keyPlaceholder}</span>
        <span>{valuePlaceholder}</span>
        {extraColumn && <span>{extraColumn.label}</span>}
        <span />
      </div>
      {rows.map((row) => (
        <div key={row.id} className={cn('grid items-center gap-2', extraColumn ? 'grid-cols-[20px_44px_1fr_1fr_90px_32px]' : 'grid-cols-[20px_44px_1fr_1fr_32px]')}>
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
          {showEnabled ? (
            <div className="flex items-center justify-center">
              <Switch
                checked={row.enabled !== false}
                onCheckedChange={(v) => updateRow(row.id, { enabled: v })}
                className="scale-75 origin-left"
                data-testid={`${testIdPrefix}-enabled-${row.id}`}
              />
            </div>
          ) : <span />}
          <Input
            value={row.key}
            placeholder={keyPlaceholder}
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
            className={cn(compact ? 'h-8 text-xs' : 'h-9 text-sm', 'font-mono')}
            data-testid={`${testIdPrefix}-key-${row.id}`}
          />
          <Input
            value={row.value}
            placeholder={valuePlaceholder}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
            className={cn(compact ? 'h-8 text-xs' : 'h-9 text-sm', 'font-mono')}
            data-testid={`${testIdPrefix}-value-${row.id}`}
          />
          {extraColumn && extraColumn.render(row, (patch) => updateRow(row.id, patch))}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-rose-400"
            onClick={() => removeRow(row.id)}
            data-testid={`${testIdPrefix}-remove-${row.id}`}
            title="Remove row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs mt-1"
        onClick={() => setRows([...rows, { id: crypto.randomUUID(), key: '', value: '', enabled: true, ...(extraColumn ? { type: 'text' } : {}) }])}
        data-testid={`${testIdPrefix}-add-row`}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add row
      </Button>
    </div>
  );
}
