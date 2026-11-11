import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Worker } from '@/lib/db/schema';

interface Option {
  id: number;
  label: string;
}

export function WorkerForm({
  worker,
  vendorOptions,
  workerTypeOptions,
  siteOptions,
  csrf,
  action,
  submitLabel,
}: {
  worker?: Worker;
  vendorOptions: Option[];
  workerTypeOptions: Option[];
  siteOptions: Option[];
  csrf: string;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid max-w-2xl grid-cols-2 gap-3">
      <input type="hidden" name="_csrf" value={csrf} />
      {worker && <input type="hidden" name="id" value={worker.id} />}

      <div className="col-span-2">
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Name</label>
        <Input name="name" required defaultValue={worker?.name} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Aadhar number (12 digits)</label>
        <Input name="aadharNumber" required pattern="\d{12}" defaultValue={worker?.aadharNumber} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Contact phone</label>
        <Input name="contact" required defaultValue={worker?.contact ?? ''} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Vendor</label>
        <select
          name="vendorId"
          required
          defaultValue={worker?.vendorId}
          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="">Select a vendor</option>
          {vendorOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Worker type</label>
        <select
          name="workerTypeId"
          defaultValue={worker?.workerTypeId ?? ''}
          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="">(none)</option>
          {workerTypeOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {worker && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Site</label>
          <select
            name="siteId"
            defaultValue={worker.siteId}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            {siteOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {worker && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Status</label>
          <select
            name="status"
            defaultValue={worker.status}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Hourly wage rate (₹)</label>
        <Input name="wageRate" type="number" step="0.01" min="0.01" required defaultValue={worker?.wageRate} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Overtime multiplier</label>
        <Input
          name="overtimeMultiplier"
          type="number"
          step="0.1"
          min="1"
          defaultValue={worker?.overtimeMultiplier ?? 1.5}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Joined date</label>
        <Input name="joinedDate" type="date" defaultValue={worker?.joinedDate ?? undefined} />
      </div>

      <div className="col-span-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
