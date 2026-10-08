import os
import sys
from pathlib import Path
from dulwich import porcelain
from dulwich.repo import Repo

REPO_ROOT = Path(__file__).resolve().parent.parent

def init_or_open_repo():
    git_dir = REPO_ROOT / ".git"
    if not git_dir.exists():
        repo = porcelain.init(str(REPO_ROOT))
        print(f"[GIT] Initialized new Git repository at {REPO_ROOT}")
    else:
        repo = Repo(str(REPO_ROOT))
    return repo

def git_commit(message: str, author: str = "SafetyIntel Engineer <engineer@safetyintel.local>"):
    repo = init_or_open_repo()
    # Add files
    porcelain.add(str(REPO_ROOT))
    # Commit
    commit_sha = porcelain.commit(str(REPO_ROOT), message=message.encode("utf-8"), author=author.encode("utf-8"))
    sha_str = commit_sha.decode("utf-8") if isinstance(commit_sha, bytes) else str(commit_sha)
    print(f"[GIT COMMIT] {sha_str[:8]} - {message}")
    return sha_str

if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Update workspace"
    git_commit(msg)
