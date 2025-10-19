// GitHub Actions Workflow Type Definitions

export interface Workflow {
    name?: string;
    on: WorkflowTriggers;
    env?: Record<string, string>;
    defaults?: WorkflowDefaults;
    jobs: Record<string, Job>;
}

export interface WorkflowTriggers {
    push?: PushTrigger | PushTrigger[];
    pull_request?: PullRequestTrigger | PullRequestTrigger[];
    pull_request_target?: PullRequestTargetTrigger | PullRequestTargetTrigger[];
    workflow_dispatch?: WorkflowDispatchTrigger;
    schedule?: CronTrigger | CronTrigger[];
    repository_dispatch?: RepositoryDispatchTrigger;
    workflow_call?: WorkflowCallTrigger;
    workflow_run?: WorkflowRunTrigger;
    release?: ReleaseTrigger | ReleaseTrigger[];
    create?: CreateTrigger;
    delete?: DeleteTrigger;
    deployment?: DeploymentTrigger;
    deployment_status?: DeploymentStatusTrigger;
    fork?: ForkTrigger;
    gollum?: GollumTrigger;
    issue_comment?: IssueCommentTrigger;
    issues?: IssuesTrigger;
    label?: LabelTrigger;
    milestone?: MilestoneTrigger;
    page_build?: PageBuildTrigger;
    project?: ProjectTrigger;
    project_card?: ProjectCardTrigger;
    project_column?: ProjectColumnTrigger;
    public?: PublicTrigger;
    pull_request_review?: PullRequestReviewTrigger;
    pull_request_review_comment?: PullRequestReviewCommentTrigger;
    registry_package?: RegistryPackageTrigger;
    status?: StatusTrigger;
    watch?: WatchTrigger;
}

export interface PushTrigger {
    branches?: string | string[];
    branches_ignore?: string | string[];
    tags?: string | string[];
    tags_ignore?: string | string[];
    paths?: string | string[];
    paths_ignore?: string | string[];
}

export interface PullRequestTrigger {
    types?: PullRequestEventType | PullRequestEventType[];
    branches?: string | string[];
    branches_ignore?: string | string[];
    paths?: string | string[];
    paths_ignore?: string | string[];
}

export interface PullRequestTargetTrigger {
    types?: PullRequestEventType | PullRequestEventType[];
    branches?: string | string[];
    branches_ignore?: string | string[];
    paths?: string | string[];
    paths_ignore?: string | string[];
}

export interface WorkflowDispatchTrigger {
    inputs?: Record<string, WorkflowInput>;
}

export interface WorkflowInput {
    description: string;
    required?: boolean;
    default?: string;
    type?: 'string' | 'number' | 'boolean' | 'choice' | 'environment';
    options?: string[];
}

export interface CronTrigger {
    cron: string;
}

export interface RepositoryDispatchTrigger {
    types?: string | string[];
}

export interface WorkflowCallTrigger {
    inputs?: Record<string, WorkflowInput>;
    outputs?: Record<string, WorkflowOutput>;
    secrets?: string | string[];
}

export interface WorkflowOutput {
    description: string;
    value: string;
}

export interface WorkflowRunTrigger {
    workflows: string | string[];
    types?: WorkflowRunEventType | WorkflowRunEventType[];
    branches?: string | string[];
    branches_ignore?: string | string[];
}

export interface ReleaseTrigger {
    types?: ReleaseEventType | ReleaseEventType[];
}

export interface CreateTrigger {
    branches?: string | string[];
    tags?: string | string[];
}

export interface DeleteTrigger {
    branches?: string | string[];
    tags?: string | string[];
}

export interface DeploymentTrigger {
    types?: DeploymentEventType | DeploymentEventType[];
}

export interface DeploymentStatusTrigger {
    types?: DeploymentStatusEventType | DeploymentStatusEventType[];
}

export interface ForkTrigger { }

export interface GollumTrigger { }

export interface IssueCommentTrigger {
    types?: IssueCommentEventType | IssueCommentEventType[];
}

export interface IssuesTrigger {
    types?: IssueEventType | IssueEventType[];
}

export interface LabelTrigger {
    types?: LabelEventType | LabelEventType[];
}

export interface MilestoneTrigger {
    types?: MilestoneEventType | MilestoneEventType[];
}

export interface PageBuildTrigger { }

export interface ProjectTrigger {
    types?: ProjectEventType | ProjectEventType[];
}

export interface ProjectCardTrigger {
    types?: ProjectCardEventType | ProjectCardEventType[];
}

export interface ProjectColumnTrigger {
    types?: ProjectColumnEventType | ProjectColumnEventType[];
}

export interface PublicTrigger { }

export interface PullRequestReviewTrigger {
    types?: PullRequestReviewEventType | PullRequestReviewEventType[];
}

export interface PullRequestReviewCommentTrigger {
    types?: PullRequestReviewCommentEventType | PullRequestReviewCommentEventType[];
}

export interface RegistryPackageTrigger {
    types?: RegistryPackageEventType | RegistryPackageEventType[];
}

export interface StatusTrigger { }

export interface WatchTrigger { }

export interface WorkflowDefaults {
    run?: JobDefaults;
    shell?: string;
    'working-directory'?: string;
}

export interface JobDefaults {
    shell?: string;
    'working-directory'?: string;
    run?: {
        shell?: string;
        'working-directory'?: string;
    };
}

export interface Job {
    name?: string;
    'runs-on': string | string[];
    needs?: string | string[];
    if?: string;
    permissions?: JobPermissions;
    environment?: string | JobEnvironment;
    concurrency?: JobConcurrency;
    outputs?: Record<string, JobOutput>;
    env?: Record<string, string>;
    defaults?: JobDefaults;
    steps: Step[];
    strategy?: JobStrategy;
    'continue-on-error'?: boolean;
    container?: JobContainer;
    services?: Record<string, JobService>;
    'timeout-minutes'?: number;
}

export interface JobPermissions {
    actions?: 'read' | 'write' | 'none';
    checks?: 'read' | 'write' | 'none';
    contents?: 'read' | 'write' | 'none';
    deployments?: 'read' | 'write' | 'none';
    'id-token'?: 'read' | 'write' | 'none';
    issues?: 'read' | 'write' | 'none';
    discussions?: 'read' | 'write' | 'none';
    packages?: 'read' | 'write' | 'none';
    pages?: 'read' | 'write' | 'none';
    'pull-requests'?: 'read' | 'write' | 'none';
    'repository-projects'?: 'read' | 'write' | 'none';
    'security-events'?: 'read' | 'write' | 'none';
    statuses?: 'read' | 'write' | 'none';
}

export interface JobEnvironment {
    name: string;
    url?: string;
}

export interface JobConcurrency {
    group: string;
    'cancel-in-progress'?: boolean;
}

export interface JobOutput {
    description?: string;
    value: string;
}

export interface JobStrategy {
    matrix: JobMatrix;
    'fail-fast'?: boolean;
    'max-parallel'?: number;
}

export interface JobMatrix {
    [key: string]: string[] | number[] | boolean[];
}

export interface JobContainer {
    image: string;
    credentials?: ContainerCredentials;
    env?: Record<string, string>;
    ports?: number[];
    volumes?: string[];
    options?: string;
}

export interface ContainerCredentials {
    username: string;
    password: string;
}

export interface JobService {
    image: string;
    credentials?: ContainerCredentials;
    env?: Record<string, string>;
    ports?: number[];
    volumes?: string[];
    options?: string;
}

export interface Step {
    id?: string;
    if?: string;
    name?: string;
    uses?: string;
    run?: string;
    shell?: string;
    with?: Record<string, any>;
    env?: Record<string, string>;
    'working-directory'?: string;
    'continue-on-error'?: boolean;
    'timeout-minutes'?: number;
}

// Event Types
export type PullRequestEventType =
    | 'assigned'
    | 'unassigned'
    | 'labeled'
    | 'unlabeled'
    | 'opened'
    | 'edited'
    | 'closed'
    | 'reopened'
    | 'synchronize'
    | 'converted_to_draft'
    | 'ready_for_review'
    | 'locked'
    | 'unlocked'
    | 'review_requested'
    | 'review_request_removed';

export type PullRequestReviewEventType = 'submitted' | 'edited' | 'dismissed';

export type PullRequestReviewCommentEventType = 'created' | 'edited' | 'deleted';

export type IssueCommentEventType = 'created' | 'edited' | 'deleted';

export type IssueEventType =
    | 'opened'
    | 'edited'
    | 'deleted'
    | 'transferred'
    | 'pinned'
    | 'unpinned'
    | 'closed'
    | 'reopened'
    | 'assigned'
    | 'unassigned'
    | 'labeled'
    | 'unlabeled'
    | 'locked'
    | 'unlocked'
    | 'milestoned'
    | 'demilestoned';

export type LabelEventType = 'created' | 'edited' | 'deleted';

export type MilestoneEventType = 'created' | 'closed' | 'opened' | 'edited' | 'deleted';

export type ProjectEventType = 'created' | 'updated' | 'closed' | 'reopened' | 'edited' | 'deleted';

export type ProjectCardEventType = 'created' | 'moved' | 'converted' | 'edited' | 'deleted';

export type ProjectColumnEventType = 'created' | 'updated' | 'moved' | 'deleted';

export type RegistryPackageEventType = 'published' | 'updated';

export type WorkflowRunEventType = 'completed' | 'requested';

export type ReleaseEventType = 'published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';

export type DeploymentEventType = 'created';

export type DeploymentStatusEventType = 'created';
