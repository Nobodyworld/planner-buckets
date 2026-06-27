import { useEffect, useState, type FormEvent } from 'react';
import type { Bucket, PlannerTask, TaskDraft } from '../types';

interface TaskEditorProps {
  buckets: Bucket[];
  task: PlannerTask | null;
  defaultBucketId: string | null;
  onSave: (draft: TaskDraft) => void;
  onClose: () => void;
}

export function TaskEditor({
  buckets,
  task,
  defaultBucketId,
  onSave,
  onClose,
}: TaskEditorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bucketId, setBucketId] = useState<string | null>(defaultBucketId);

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setBucketId(task?.bucketId ?? defaultBucketId);
  }, [task, defaultBucketId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({ title, description, bucketId });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={submit}>
          <div className="modal-header">
            <h2 id="task-editor-title">{task ? 'Edit task' : 'Create task'}</h2>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <label>
            Task name
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to be done?"
              maxLength={160}
              required
            />
          </label>

          <label>
            Notes
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional details"
              rows={5}
            />
          </label>

          <label>
            Bucket
            <select
              value={bucketId ?? ''}
              onChange={(event) => setBucketId(event.target.value || null)}
            >
              <option value="">Unassigned</option>
              {buckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </select>
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              {task ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
