import type { BucketTemplate, BucketTemplateDefinition, BucketV2, PlannerDataV2, Project } from '../types/v2';
import { validatePlannerDataV2Integrity } from '../types/validators';

export interface BucketTaskCounts {
    open: number;
    completed: number;
    archived: number;
}

export interface GlobalBucketViewBucket {
    bucket: BucketV2;
    project: Project;
    taskCounts: BucketTaskCounts;
}

export interface GlobalBucketViewGroup {
    template: BucketTemplate;
    definition: BucketTemplateDefinition;
    buckets: GlobalBucketViewBucket[];
    aggregateTaskCounts: BucketTaskCounts;
}

const createEmptyTaskCounts = (): BucketTaskCounts => ({
    open: 0,
    completed: 0,
    archived: 0,
});

const addTaskCounts = (left: BucketTaskCounts, right: BucketTaskCounts): BucketTaskCounts => ({
    open: left.open + right.open,
    completed: left.completed + right.completed,
    archived: left.archived + right.archived,
});

export const getGlobalBucketView = (data: PlannerDataV2): GlobalBucketViewGroup[] => {
    validatePlannerDataV2Integrity(data);

    const templatesById = new Map(data.templates.map((template) => [template.id, template]));
    const definitionsById = new Map(data.templateDefinitions.map((definition) => [definition.id, definition]));
    const projectsById = new Map(data.projects.map((project) => [project.id, project]));
    const templateOrder = new Map(data.templates.map((template, index) => [template.id, index]));
    const definitionOrder = new Map(data.templateDefinitions.map((definition, index) => [definition.id, index]));
    const projectOrder = new Map(data.projects.map((project, index) => [project.id, index]));
    const bucketOrder = new Map(data.buckets.map((bucket, index) => [bucket.id, index]));

    const taskCountsByBucketId = new Map<string, BucketTaskCounts>();
    for (const task of data.tasks) {
        if (task.bucketId === null) continue;
        const counts = taskCountsByBucketId.get(task.bucketId) ?? createEmptyTaskCounts();
        if (task.archivedAt !== null) {
            counts.archived += 1;
        } else if (task.completed) {
            counts.completed += 1;
        } else {
            counts.open += 1;
        }
        taskCountsByBucketId.set(task.bucketId, counts);
    }

    const bucketEntriesByDefinitionId = new Map<string, GlobalBucketViewBucket[]>();

    for (const bucket of data.buckets) {
        if (bucket.templateDefinitionId === null) continue;

        const definition = definitionsById.get(bucket.templateDefinitionId);
        if (!definition) {
            throw new Error(`Bucket ${bucket.id} references missing template definition ${bucket.templateDefinitionId}`);
        }

        const template = templatesById.get(definition.templateId);
        if (!template) {
            throw new Error(`Template definition ${definition.id} references missing template ${definition.templateId}`);
        }

        const project = projectsById.get(bucket.projectId);
        if (!project) {
            throw new Error(`Bucket ${bucket.id} references missing project ${bucket.projectId}`);
        }

        const entry: GlobalBucketViewBucket = {
            bucket,
            project,
            taskCounts: taskCountsByBucketId.get(bucket.id) ?? createEmptyTaskCounts(),
        };
        const entries = bucketEntriesByDefinitionId.get(definition.id) ?? [];
        entries.push(entry);
        bucketEntriesByDefinitionId.set(definition.id, entries);
    }

    const groups: GlobalBucketViewGroup[] = [];

    for (const [definitionId, buckets] of bucketEntriesByDefinitionId) {
        const definition = definitionsById.get(definitionId);
        if (!definition) continue;
        const template = templatesById.get(definition.templateId);
        if (!template) continue;

        const sortedBuckets = buckets.slice().sort((left, right) => {
            const projectDelta = (projectOrder.get(left.project.id) ?? 0) - (projectOrder.get(right.project.id) ?? 0);
            if (projectDelta !== 0) return projectDelta;
            return (bucketOrder.get(left.bucket.id) ?? 0) - (bucketOrder.get(right.bucket.id) ?? 0);
        });

        groups.push({
            template,
            definition,
            buckets: sortedBuckets,
            aggregateTaskCounts: sortedBuckets.reduce(
                (counts, bucket) => addTaskCounts(counts, bucket.taskCounts),
                createEmptyTaskCounts(),
            ),
        });
    }

    return groups.sort((left, right) => {
        const templateDelta = (templateOrder.get(left.template.id) ?? 0) - (templateOrder.get(right.template.id) ?? 0);
        if (templateDelta !== 0) return templateDelta;
        if (left.definition.position !== right.definition.position) {
            return left.definition.position - right.definition.position;
        }
        return (definitionOrder.get(left.definition.id) ?? 0) - (definitionOrder.get(right.definition.id) ?? 0);
    });
};
