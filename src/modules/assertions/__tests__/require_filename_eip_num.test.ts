import {
  expectError,
  expectErrorWithHandler,
  initGeneralTestEnv,
  mockGithubContext
} from "src/tests/testutils";
import { EVENTS } from "src/domain";
import { RequireFilenameEIPNum } from "#/assertions/require_filename_eip_num";
import { FileFactory } from "src/tests/factories/fileFactory";
import { PRFactory } from "src/tests/factories/prFactory";
import { Exceptions } from "src/domain/exceptions";

describe("requireFilenameEipNum", () => {
  mockGithubContext({
    payload: { pull_request: { number: 1 } },
    repo: { repo: "repo", owner: "owner" },
    eventName: EVENTS.pullRequestTarget
  });

  initGeneralTestEnv();

  const requireEIPEditors = jest.fn();
  const getPullRequestFiles = jest.fn();
  const requirePr = jest.fn();
  const getApprovals = jest.fn();
  const _RequireFilenameEIPNum = new RequireFilenameEIPNum({
    requireEIPEditors,
    getPullRequestFiles,
    requirePr,
    getApprovals
  });

  const attemptEditorApproval = jest
    .fn()
    .mockImplementation(
      _RequireFilenameEIPNum.attemptEditorApprovalGracefulTermination
    );
  const attemptAsset = jest
    .fn()
    .mockImplementation(_RequireFilenameEIPNum.attemptAssetGracefulTermination);

  _RequireFilenameEIPNum.attemptEditorApprovalGracefulTermination =
    attemptEditorApproval;
  _RequireFilenameEIPNum.attemptAssetGracefulTermination = attemptAsset;

  beforeEach(async () => {
    requireEIPEditors.mockReturnValue(["@test"]);
    getPullRequestFiles.mockResolvedValue(FileFactory());
    requirePr.mockResolvedValue(await PRFactory());
    // no approvals
    getApprovals.mockResolvedValue([]);
  });

  it("should not error if filename matches regex", async () => {
    const eipNum = await _RequireFilenameEIPNum.requireFilenameEipNum(
      "eip-123.md"
    );
    expect(eipNum).toBe(123);
  });

  it("should not explode if filename doesn't match", async () => {
    await expectError(() =>
      _RequireFilenameEIPNum.requireFilenameEipNum("eip-123")
    );
    await expectError(() =>
      _RequireFilenameEIPNum.requireFilenameEipNum("ep-123.md")
    );
    await expectError(() =>
      _RequireFilenameEIPNum.requireFilenameEipNum("eip-a.md")
    );
    await expectError(() =>
      _RequireFilenameEIPNum.requireFilenameEipNum("eip-123.js")
    );
  });

  it("should attempt graceful termination if files don't match pattern", async () => {
    await _RequireFilenameEIPNum
      .requireFilenameEipNum("eip-dsd")
      .catch((_) => {});
    expect(attemptEditorApproval).toBeCalledTimes(1);
    expect(attemptEditorApproval).toBeCalledTimes(1);
    expect(attemptEditorApproval).toBeCalledTimes(1);
  });

  describe("graceful termination routes", () => {
    describe("editor approval", () => {
      it("should explode with graceful termination with editor approval", async () => {
        // this should return the name of one of the editors
        getApprovals.mockResolvedValue(["@test"]);
        await expectErrorWithHandler(
          () =>
            _RequireFilenameEIPNum.attemptEditorApprovalGracefulTermination(
              "test"
            ),
          (err) => {
            expect(err.type).toBe(Exceptions.gracefulTermination);
          },
          "should explode with graceful termination"
        );
      });

      it("should not explode with graceful if there's no editor approval", async () => {
        // this should return the name of one of the editors
        getApprovals.mockResolvedValue(["@test2"]);
        await _RequireFilenameEIPNum.attemptEditorApprovalGracefulTermination(
          "test"
        );
      });
    });

    describe("related asset changes", () => {
      const expectGraceful = (filename: string) => {
        return expectErrorWithHandler(
          () =>
            _RequireFilenameEIPNum.attemptAssetGracefulTermination(filename),
          (err) => {
            expect(err.type).toBe(Exceptions.gracefulTermination);
          },
          "related asset changes"
        );
      };
      beforeEach(() => {
        getPullRequestFiles.mockResolvedValue([
          FileFactory({ filename: "EIPs/eip-2.md" })
        ]);
      });
      it("should explode with graceful termination if the assets are allowed", async () => {
        await expectGraceful("assets/eip-2/test.md");
      });
      it("should fail if the file is not in assets folder", async () => {
        await expectError(
          () => expectGraceful("eip-1/test.md"),
          "should fail if the file is not in assets folder"
        );
      });
      it("should fail if the change is made to a file in a different eip folder", async () => {
        await expectError(
          () => expectGraceful("assets/eip-1/test.md"),
          "should fail if the change is made to a file in a different eip folder"
        );
      });
    });
  });
});
