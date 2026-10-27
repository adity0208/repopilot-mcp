export interface GitHubLabel {
  id?: number;
  node_id?: string;
  url?: string;
  name: string;
  description?: string | null;
  color?: string;
  default?: boolean;
}

export interface GitHubUser {
  login: string;
  id?: number;
  avatar_url?: string;
  html_url?: string;
  type?: string;
}

export interface GitHubRawIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: (string | GitHubLabel)[];
  user: GitHubUser | null;
  assignee: GitHubUser | null;
  assignees: GitHubUser[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: {
    url?: string;
    html_url?: string;
    diff_url?: string;
    patch_url?: string;
  };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: GitHubLabel[];
  assignee: GitHubUser | null;
  assignees: GitHubUser[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface RepoCoordinates {
  owner: string;
  repo: string;
}
