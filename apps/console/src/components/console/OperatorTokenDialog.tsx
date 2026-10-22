'use client';

import { KeyRound } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { useOperator } from '@/stores/operator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/** "Operator token" dialog. The token is checked with GET /operator/check, then kept in sessionStorage. */
export function OperatorTokenDialog() {
  const open = useOperator((s) => s.dialogOpen);
  const close = useOperator((s) => s.closeDialog);
  const setToken = useOperator((s) => s.setToken);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  useEffect(() => {
    if (open) {
      setError(null);
      setValue('');
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const token = value.trim();
    if (!token) {
      setError(t.operator.rejected);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await api.operatorCheck(token);
      setToken(token);
      close();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED') setError(t.operator.rejected);
      else if (err instanceof ApiError && err.code === 'NETWORK') setError(t.operator.unreachable(API_URL));
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-3">
          <KeyRound aria-hidden className="size-7" />
          {t.operator.dialogTitle}
        </DialogTitle>
        <DialogDescription>{t.operator.dialogBody}</DialogDescription>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label htmlFor={fieldId} className="text-base font-semibold">
            {t.operator.field}
          </label>
          <input
            id={fieldId}
            type="password"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="min-h-12 rounded-button border border-panel-line bg-panel-sunken px-4 text-base text-ink"
          />
          {error && (
            <p id={errorId} role="alert" className="text-base font-semibold text-danger-ink">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={close}>
              {t.operator.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={checking}>
              {checking ? t.operator.checking : t.operator.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
