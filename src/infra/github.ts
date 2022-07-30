import { context, getOctokit } from "@actions/github";
import {
  ChangeTypes,
  ContentData,
  GITHUB_TOKEN,
  GithubSelf,
  isChangeType,
  isDefined,
  isMock,
  IssueComments,
  isTest,
  PR,
  Review
} from "src/domain";
import _ from "lodash";

const getEventName = () => {
  return context.eventName;
};

const getPullNumber = () => {
  return context.payload?.pull_request?.number || Number(process.env.PR_NUMBER);
};

const getPullRequestFromNumber = (pullNumber: number) => {
  const github = getOctokit(GITHUB_TOKEN).rest;

  return github.pulls
    .get({
      repo: context.repo.repo,
      owner: context.repo.owner,
      pull_number: pullNumber
    })
    .then((res) => {
      return res.data;
    });
};

/**
 * this recurses through github pages of reviews until none are left; it is
 * meant to avoid losing data if there's more data than can be retrieved in one
 * request
 * */
const getPullRequestReviews = async (
  pullNumber: number,
  page = 1
): Promise<Review[]> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  const { data: reviews }: { data: Review[] } = await Github.pulls.listReviews({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pullNumber,
    per_page: 100,
    page
  });
  if (_.isEmpty(reviews)) {
    return reviews;
  }
  return getPullRequestReviews(pullNumber, page + 1).then((res) =>
    reviews.concat(res)
  );
};

const getPullRequestFiles = (pullNumber: number) => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  return Github.pulls
    .listFiles({
      pull_number: pullNumber,
      repo: context.repo.repo,
      owner: context.repo.owner
    })
    .then((res) => res.data);
};

const getRepoFilenameContent = (
  filename: string,
  sha: string
): Promise<ContentData> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  return Github.repos
    .getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: filename,
      ref: sha
    })
    .then((res) => res.data);
};

const requestReview = (pr: PR, reviewer: string) => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  return (
    Github.pulls
      .requestReviewers({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pr.number,
        reviewers: [reviewer]
      })
      // if an error occurs return undefined
      .catch((err) => {})
  );
};

const resolveUserByEmail = async (email: string) => {
  const Github = getOctokit(GITHUB_TOKEN).rest;

  // @ts-ignore
  const { data: rawEmailSearch } = await Github.search.users({
    q: email
  });

  if (rawEmailSearch.total_count > 0 && rawEmailSearch.items[0] !== undefined) {
    return "@" + rawEmailSearch.items[0].login;
  }

  const { data: emailSearch } = await Github.search.users({
    q: `${email} in:email`
  });

  if (emailSearch.total_count === 1 && isDefined(emailSearch.items[0])) {
    return "@" + emailSearch.items[0].login;
  }

  const local = email.split("@")[0];
  if (!local) return;
  const firstName = local.split(".")[0];
  const lastName = local.split(".")[1];
  if (!firstName || !lastName) return;

  const { data: nameSearch } = await Github.search.users({
    q: `fullname:${firstName} ${lastName} type:users`
  });

  if (nameSearch.total_count === 1 && isDefined(nameSearch.items[0])) {
    return "@" + nameSearch.items[0].login;
  }

  return;
};

const getSelf = (): Promise<GithubSelf> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  return Github.users.getAuthenticated().then((res) => {
    return res.data;
  });
};

const getContextIssueComments = (): Promise<IssueComments> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  return Github.issues
    .listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number
    })
    .then((res) => res.data);
};

const updateComment = (commentId: number, message: string): Promise<any> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  return Github.issues
    .updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: commentId,
      body: message
    })
    .catch((err) => {
      if (err?.request?.body) {
        err.request.body = JSON.parse(err.request.body).body;
      }
      throw err;
    });
};

const createCommentOnContext = (message: string): Promise<any> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  return Github.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    body: message
  });
};

const getContextLabels = async (): Promise<ChangeTypes[]> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  const { data: issue } = await Github.issues.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number
  });

  const labels = issue.labels;

  return labels
    .map((label) => {
      if (typeof label === "string") {
        return label;
      }
      return label.name;
      // this will make it so that the only labels considered are ChangeTypes
    })
    .filter(isDefined)
    .filter(isChangeType);
};

const setLabels = async (labels: string[]): Promise<void> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;
  await Github.issues
    .setLabels({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      // @ts-expect-error the expected type is (string[] & {name: string}[]) | undefined
      // but string[] and {name: string}[] cannot simultaneously coincide
      labels
    })
    .then((res) => res);
};

const addLabels = async (labels: string[]): Promise<void> => {
  const Github = getOctokit(GITHUB_TOKEN).rest;

  // makes it easy to maintain the integration tests and the
  // responses from this are not used
  if (isMock() || isTest()) return;

  // because of a weird type issue
  const { addLabels: _addLabels } = Github.issues;

  await _addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    labels
  });
};

const removeLabels = async (labels: string[]) => {
  const Github = getOctokit(GITHUB_TOKEN).rest;

  // makes it easy to maintain the integration tests and the
  // responses from this are not used
  if (isMock() || isTest()) return;

  await Promise.all(
    // this will submit a max of three requests which is not enough to
    // rate limit
    labels.map((label) =>
      Github.issues.removeLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        name: label
      })
    )
  );
};

export const github = {
  getSelf,
  resolveUserByEmail,
  requestReview,
  getRepoFilenameContent,
  getPullRequestFiles,
  getPullRequestReviews,
  getPullRequestFromNumber,
  getPullNumber,
  getEventName,
  getContextIssueComments,
  updateComment,
  createCommentOnContext,
  getContextLabels,
  setLabels,
  addLabels,
  removeLabels
};

export type GithubInfra = typeof github;
