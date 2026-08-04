'use client';
import dynamic from 'next/dynamic';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import KeyValueEditor from './KeyValueEditor';

const Editor = dynamic(() => import('@monaco-editor/react').then((m) => m.default), { ssr: false });

const BODY_TYPES = [
  { id: 'none', label: 'none' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'xml', label: 'XML' },
  { id: 'html', label: 'HTML' },
  { id: 'formdata', label: 'Form Data' },
  { id: 'urlencoded', label: 'x-www-form-urlencoded' },
];

const LANG_MAP = { json: 'json', text: 'plaintext', javascript: 'javascript', xml: 'xml', html: 'html' };

export default function BodyEditor({ body, onChange, theme }) {
  const patch = (p) => onChange({ ...body, ...p });

  return (
    <div className="space-y-3">
      <RadioGroup
        value={body.type || 'none'}
        onValueChange={(v) => patch({ type: v })}
        className="flex flex-wrap gap-3"
      >
        {BODY_TYPES.map((t) => (
          <div key={t.id} className="flex items-center gap-1.5">
            <RadioGroupItem value={t.id} id={`body-${t.id}`} data-testid={`body-radio-${t.id}`} />
            <Label htmlFor={`body-${t.id}`} className="text-xs cursor-pointer">{t.label}</Label>
          </div>
        ))}
      </RadioGroup>

      {body.type === 'none' && (
        <div className="text-xs text-muted-foreground p-6 rounded-md bg-muted/30">
          This request does not have a body.
        </div>
      )}

      {['json', 'text', 'javascript', 'xml', 'html'].includes(body.type) && (
        <div className="space-y-2">
          {body.type === 'json' && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  try {
                    const pretty = JSON.stringify(JSON.parse(body.json || '{}'), null, 2);
                    patch({ json: pretty });
                    toast.success('Formatted');
                  } catch (e) {
                    toast.error('Invalid JSON');
                  }
                }}
                data-testid="body-format-json"
              >
                <Wand2 className="h-3 w-3 mr-1" /> Format
              </Button>
            </div>
          )}
          <div className="h-[260px] border border-border/60 rounded-md overflow-hidden">
            <Editor
              value={body[body.type] || ''}
              onChange={(v) => patch({ [body.type]: v || '' })}
              language={LANG_MAP[body.type]}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      )}

      {body.type === 'formdata' && (
        <KeyValueEditor
          rows={body.formdata || []}
          onChange={(rows) => patch({ formdata: rows })}
          testIdPrefix="body-formdata"
        />
      )}

      {body.type === 'urlencoded' && (
        <KeyValueEditor
          rows={body.urlencoded || []}
          onChange={(rows) => patch({ urlencoded: rows })}
          testIdPrefix="body-urlencoded"
        />
      )}
    </div>
  );
}
