export class CommunityReactionTapGuard {
  private suppressTap = false;

  suppressNextTap() {
    this.suppressTap = true;
  }

  consumeSuppressedTap() {
    const shouldSuppress = this.suppressTap;
    this.suppressTap = false;
    return shouldSuppress;
  }

  reset() {
    this.suppressTap = false;
  }
}
