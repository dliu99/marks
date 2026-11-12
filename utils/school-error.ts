// School data is shown only when the latest request for it succeeded. When it fails,
// screens show one of these errors instead of older data.
export type SchoolErrorCopy = {
  title: string;
  message: string;
  code: string;
  needsSignIn: boolean;
};

function getStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = Number(error.status);
  return Number.isFinite(status) ? status : undefined;
}

/** Prefer an expired login over other errors: signing in is the only fix for it. */
export function pickSchoolError(...errors: unknown[]) {
  const present = errors.filter(Boolean);
  return present.find((error) => getStatus(error) === 401) ?? present[0] ?? null;
}

/** `subject` completes "your current …", e.g. "grades" or "assignments". */
export function getSchoolErrorCopy(error: unknown, subject: string): SchoolErrorCopy {
  const status = getStatus(error);
  const code = status ? `Error ${status}` : 'Error';

  if (status === 401) {
    return {
      title: 'Sign in to Infinite Campus again',
      message: `Your school ended your saved login, so Marks can't load your current ${subject}.`,
      code,
      needsSignIn: true,
    };
  }
  // Network failures and timeouts reach the screens as 503 from the in-app API.
  if (status === 0 || status === 408 || status === 502 || status === 503 || status === 504) {
    return {
      title: "Can't reach Infinite Campus",
      message: `Marks couldn't get your current ${subject} from your school. Check your connection and try again.`,
      code,
      needsSignIn: false,
    };
  }
  if (status === 403) {
    return {
      title: 'Infinite Campus blocked this',
      message: `Your school didn't let Marks load your ${subject}. Try again, or check Infinite Campus directly.`,
      code,
      needsSignIn: false,
    };
  }
  if (status === 409) {
    return {
      title: 'Your account changed',
      message: `Try again to load ${subject} for the account you're signed in to.`,
      code,
      needsSignIn: false,
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      title: 'Infinite Campus had a problem',
      message: `Your school's server returned an error instead of your ${subject}. Try again in a moment.`,
      code,
      needsSignIn: false,
    };
  }
  return {
    title: `Couldn't load your ${subject}`,
    message: `Infinite Campus didn't return your current ${subject}. Try again.`,
    code,
    needsSignIn: false,
  };
}
