import type { KeyboardEvent, RefObject } from 'react';
import type { BucketV2 as Bucket } from '../../types/v2';

export interface QuickTaskPanelProps {
    shellRef: RefObject<HTMLDivElement>;
    taskInputRef: RefObject<HTMLInputElement>;
    bucketInputRef: RefObject<HTMLInputElement>;
    isOpen: boolean;
    title: string;
    bucketName: string;
    bucketSuggestionSuffix: string;
    activeBuckets: Bucket[];
    bucketIdByNormalizedName: ReadonlyMap<string, string>;
    normalizeBucketName: (name: string) => string;
    onTitleChange: (value: string) => void;
    onBucketNameChange: (value: string) => void;
    onBucketIdChange: (bucketId: string | null) => void;
    onTitleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    onBucketKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    onSubmit: () => void;
}

export function QuickTaskPanel({
    shellRef,
    taskInputRef,
    bucketInputRef,
    isOpen,
    title,
    bucketName,
    bucketSuggestionSuffix,
    activeBuckets,
    bucketIdByNormalizedName,
    normalizeBucketName,
    onTitleChange,
    onBucketNameChange,
    onBucketIdChange,
    onTitleKeyDown,
    onBucketKeyDown,
    onSubmit,
}: QuickTaskPanelProps) {
    return (
        <section className="panel-card" aria-label="Quick add tasks">
            <h2>Quick Add</h2>
            <div ref={shellRef} className={`quick-task-shell interaction-scroll-target${isOpen ? ' open' : ''}`}>
                {isOpen && (
                    <div className="quick-task-fields interaction-enter">
                        <div className="quick-task-input-stack">
                            <input
                                ref={taskInputRef}
                                className="quick-task-input"
                                value={title}
                                onChange={(event) => onTitleChange(event.target.value)}
                                onKeyDown={onTitleKeyDown}
                                placeholder="Task title"
                                maxLength={160}
                                aria-label="Quick add task title"
                            />
                            <div className="quick-task-bucket-field">
                                {bucketSuggestionSuffix && (
                                    <span className="quick-task-bucket-ghost" aria-hidden="true">
                                        <span className="quick-task-bucket-ghost-typed">{bucketName.trim()}</span>
                                        <span className="quick-task-bucket-ghost-suffix">{bucketSuggestionSuffix}</span>
                                    </span>
                                )}
                                <input
                                    ref={bucketInputRef}
                                    className="quick-task-bucket-input"
                                    value={bucketName}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        onBucketNameChange(value);
                                        const existingBucketId = bucketIdByNormalizedName.get(normalizeBucketName(value)) ?? null;
                                        onBucketIdChange(existingBucketId);
                                    }}
                                    onKeyDown={onBucketKeyDown}
                                    placeholder="Bucket (optional)"
                                    maxLength={80}
                                    list="quick-task-bucket-options"
                                    title="Autocomplete available. Press Right Arrow to accept suggestion."
                                    aria-label="Quick add bucket name"
                                />
                            </div>
                            <datalist id="quick-task-bucket-options">
                                {activeBuckets.map((bucket) => (
                                    <option key={bucket.id} value={bucket.name} />
                                ))}
                            </datalist>
                        </div>
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={onSubmit}
                            disabled={!title.trim()}
                        >
                            Add task
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
