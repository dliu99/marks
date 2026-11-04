export type ReviewTriggerSource = 'initial' | 'profile-retry';

const PROFILE_RETRY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function isProfileReviewEligible(lastAttemptAt: number | null, now: number): boolean {
  if (lastAttemptAt === null) {
    return true;
  }

  return now - lastAttemptAt >= PROFILE_RETRY_COOLDOWN_MS;
}

// The standalone release no longer prompts users to review an unavailable listing.
export async function maybeRequestReview(_source: ReviewTriggerSource): Promise<void> {}
