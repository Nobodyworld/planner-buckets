import type { KeyboardEvent } from 'react';

export interface CreateBucketPanelProps {
    bucketName: string;
    onBucketNameChange: (value: string) => void;
    onAddBucket: () => void;
}

export function CreateBucketPanel({ bucketName, onBucketNameChange, onAddBucket }: CreateBucketPanelProps) {
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') onAddBucket();
    };

    return (
        <section className="panel-card" aria-label="Create bucket">
            <h2>Buckets</h2>
            <div className="bucket-create-row">
                <input
                    value={bucketName}
                    onChange={(event) => onBucketNameChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="New bucket name"
                    maxLength={80}
                    aria-label="New bucket name"
                />
                <button type="button" className="secondary-button" onClick={onAddBucket}>
                    Add bucket
                </button>
            </div>
        </section>
    );
}
