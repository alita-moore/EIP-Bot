import { context, getOctokit } from "@actions/github";
import { setFailed } from "@actions/core";
import {
  requireEvent,
  requireFiles,
  requirePr,
  requirePullNumber
} from "#/assertions";

import { Files, PR } from "src/domain";
import { github } from "src/infra/github";

//rate limit might be exceeded
 

export const  requireMaxFileNumber = () => {	
	const max_files_allowed = 100;
	requireEvent();
  const pr = await requirePr();
	const files = await github.getPullRequestFiles(pr.number);
  if (files?.length)>100 {
    console.log(`Critical error: Number of PR Files > 100`);
    System.exit(1);
		}
	};
