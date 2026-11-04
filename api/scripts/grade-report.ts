#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';
import * as Iron from 'iron-webcrypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildGradeReport,
  formatGradeReport,
  formatGradeReportSummary,
  type GradeDetailResult,
  type GradeReport,
  type GradeReportOptions,
  type GradeReportSource,
} from '../src/grade-report';
import { extractCourseGradeDetail, extractCourseGrades } from '../src/course-grades';
import {
  auditResponsiveSchedule,
  scheduleSummary,
  type ScheduleAudit,
} from '../src/responsive-schedule-report';
import { fetchUserAccount } from '../src/user-account';
import type {
  Assignment,
  CourseGradeAPIResponse,
  Enrollment,
  Session,
  userAccount,
} from '../src/types';

const DEFAULT_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 20_000;

function getRequestSignal() {
  const timeoutSignal = AbortSignal as typeof AbortSignal & {
    timeout(milliseconds: number): AbortSignal;
  };
  return timeoutSignal.timeout(REQUEST_TIMEOUT_MS);
}

type SessionRow = {
  uuid: string;
  session_token: string;
  updated_at?: string | null;
};

type CommandMode =
  | { kind: 'uuid'; uuid: string }
  | { kind: 'all' }
  | { kind: 'sample'; count: number }
  | { kind: 'recent'; count: number }
  | { kind: 'list' }
  | { kind: 'districts' }
  | { kind: 'fixture'; path: string };

type CliOptions = GradeReportOptions & {
  mode: CommandMode | null;
  concurrency: number;
  summary: boolean;
  json: boolean;
  includeRaw: boolean;
  showIdentifiers: boolean;
  failOnIssues: boolean;
  refresh: boolean;
  responsiveSchedule?: boolean;
  districts: string[];
  excludeDistricts: string[];
  saveFixtures?: string;
};

type Fixture = {
  sessionRef?: string;
  district?: string;
  user?: userAccount;
  userError?: string;
  enrollments: Enrollment[];
  assignments?: Assignment[];
  assignmentsError?: string;
  details?: Record<string, CourseGradeAPIResponse>;
  detailErrors?: Record<string, string>;
  responsiveSchedule?: ScheduleAudit;
};

const HELP = `
Generate the text equivalent of the Marks grade UI from raw Infinite Campus data.

Usage:
  bun run report -- --uuid <session-uuid> [options]
  bun run report -- --recent <count> [options]
  bun run report -- --sample <count> [options]
  bun run report -- --all [options]
  bun run report -- --list [--show-identifiers]
  bun run report -- --districts
  bun run report -- --fixture <path> [options]

Targets:
  --uuid <id>             Inspect one Supabase ic_sessions row in detail
  --recent <count>        Audit the most recently updated live sessions
  --sample <count>        Audit a random sample; emits privacy-safe summaries
  --all                   Audit every stored session; emits summaries
  --list                  List stored session references without contacting IC
  --districts             Count stored sessions by district without contacting IC
  --fixture <path>        Run against a local JSON fixture; no credentials/network

Selection and output:
  --as-of <YYYY-MM-DD>    Run Automatic term selection as of this date
  --term-id <id>          Match the app's manually selected term
  --task-id <id>          Match the app's manually selected grading task
  --summary               Print only counts and diagnostic codes
  --responsive-schedule   Also audit responsive schedule availability and offerings (GET only)
  --json                  Emit JSON instead of text
  --include-raw           Include raw IC detail payloads in JSON (sensitive)
  --show-identity         Show the student's full name in a detailed report
  --show-identifiers      Show full Supabase session UUIDs
  --refresh               Refresh the IC device cookie locally before reading
  --concurrency <count>   Concurrent live sessions (default: ${DEFAULT_CONCURRENCY})
  --district <text>       Only audit sessions whose district host contains text (repeatable)
  --exclude-district <text>
                          Skip sessions whose district host contains text (repeatable)
  --save-fixtures <dir>   Write an anonymized fixture per live session (fetches detail for
                          every current-year section; keep output in .context)
  --fail-on-issues        Exit 2 when diagnostics contain errors
  --help                  Show this help

Live commands require SUPABASE_SERVICE_ROLE_KEY and IRON_KEY. Session tokens,
cookies, and credentials are never printed. --sample and --all never print names.
`.trim();

function requireValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function setMode(options: CliOptions, mode: CommandMode) {
  if (options.mode) throw new Error('Choose exactly one target mode');
  options.mode = mode;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: null,
    concurrency: DEFAULT_CONCURRENCY,
    summary: false,
    json: false,
    includeRaw: false,
    showIdentifiers: false,
    showIdentity: false,
    failOnIssues: false,
    refresh: false,
    districts: [],
    excludeDistricts: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--uuid':
        setMode(options, { kind: 'uuid', uuid: requireValue(args, index, arg) });
        index += 1;
        break;
      case '--sample':
        setMode(options, {
          kind: 'sample',
          count: parsePositiveInteger(requireValue(args, index, arg), arg),
        });
        index += 1;
        break;
      case '--recent':
        setMode(options, {
          kind: 'recent',
          count: parsePositiveInteger(requireValue(args, index, arg), arg),
        });
        index += 1;
        break;
      case '--all':
        setMode(options, { kind: 'all' });
        break;
      case '--list':
        setMode(options, { kind: 'list' });
        break;
      case '--districts':
        setMode(options, { kind: 'districts' });
        break;
      case '--district':
        options.districts.push(requireValue(args, index, arg).toLowerCase());
        index += 1;
        break;
      case '--exclude-district':
        options.excludeDistricts.push(requireValue(args, index, arg).toLowerCase());
        index += 1;
        break;
      case '--save-fixtures':
        options.saveFixtures = requireValue(args, index, arg);
        index += 1;
        break;
      case '--fixture':
        setMode(options, { kind: 'fixture', path: requireValue(args, index, arg) });
        index += 1;
        break;
      case '--as-of': {
        const value = requireValue(args, index, arg);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          throw new Error('--as-of must use YYYY-MM-DD');
        }
        const date = new Date(`${value}T12:00:00Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
          throw new Error('--as-of must be a real calendar date');
        }
        options.now = date;
        index += 1;
        break;
      }
      case '--term-id':
        options.preferredTermID = parsePositiveInteger(requireValue(args, index, arg), arg);
        index += 1;
        break;
      case '--task-id':
        options.preferredTaskID = parsePositiveInteger(requireValue(args, index, arg), arg);
        index += 1;
        break;
      case '--concurrency':
        options.concurrency = parsePositiveInteger(requireValue(args, index, arg), arg);
        index += 1;
        break;
      case '--summary':
        options.summary = true;
        break;
      case '--responsive-schedule':
        options.responsiveSchedule = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--include-raw':
        options.includeRaw = true;
        break;
      case '--show-identity':
        options.showIdentity = true;
        break;
      case '--show-identifiers':
        options.showIdentifiers = true;
        break;
      case '--refresh':
        options.refresh = true;
        break;
      case '--fail-on-issues':
        options.failOnIssues = true;
        break;
      case '--help':
      case '-h':
        console.log(HELP);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.mode)
    throw new Error(
      'Choose a target: --uuid, --recent, --sample, --all, --list, --districts, or --fixture'
    );
  if (options.includeRaw && !options.json) {
    throw new Error('--include-raw is only valid with --json');
  }
  if (
    (options.mode.kind === 'all' ||
      options.mode.kind === 'recent' ||
      options.mode.kind === 'sample') &&
    (options.showIdentity || options.includeRaw)
  ) {
    throw new Error('Bulk audits do not allow --show-identity or --include-raw');
  }
  if (
    options.refresh &&
    (options.mode.kind === 'fixture' ||
      options.mode.kind === 'list' ||
      options.mode.kind === 'districts')
  ) {
    throw new Error('--refresh is only valid with --uuid, --sample, or --all');
  }

  if (
    (options.districts.length > 0 || options.excludeDistricts.length > 0) &&
    !['all', 'recent', 'sample'].includes(options.mode.kind)
  ) {
    throw new Error('--district and --exclude-district are only valid with bulk audits');
  }
  if (
    options.saveFixtures &&
    options.mode.kind !== 'uuid' &&
    !['all', 'recent', 'sample'].includes(options.mode.kind)
  ) {
    throw new Error('--save-fixtures is only valid with live sessions');
  }

  return options;
}

function getSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function getSessionRows(): Promise<SessionRow[]> {
  const supabase = getSupabase();
  const pageSize = 1_000;
  const rows: SessionRow[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('ic_sessions')
      .select('uuid, session_token, updated_at')
      .order('uuid', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(`Unable to read ic_sessions: ${error.message}`);
    rows.push(...((data ?? []) as SessionRow[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function getSessionRow(uuid: string): Promise<SessionRow | null> {
  const { data, error } = await getSupabase()
    .from('ic_sessions')
    .select('uuid, session_token')
    .eq('uuid', uuid)
    .maybeSingle();
  if (error) throw new Error(`Unable to read ic_sessions: ${error.message}`);
  return data as SessionRow | null;
}

async function getRecentSessionRows(count: number): Promise<SessionRow[]> {
  const { data, error } = await getSupabase()
    .from('ic_sessions')
    .select('uuid, session_token')
    .order('updated_at', { ascending: false })
    .limit(count);
  if (error) throw new Error(`Unable to read ic_sessions: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

async function getSessionIdentifiers(): Promise<string[]> {
  const supabase = getSupabase();
  const pageSize = 1_000;
  const identifiers: string[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('ic_sessions')
      .select('uuid')
      .order('uuid', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(`Unable to read ic_sessions: ${error.message}`);
    identifiers.push(...(data ?? []).map((row) => row.uuid as string));
    if (!data || data.length < pageSize) break;
  }

  return identifiers;
}

function shuffle<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function maskIdentifier(value: string) {
  if (value.length <= 7) return `${value.slice(0, 1)}…${value.slice(-1)}`;
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}

function getDistrict(session: Session) {
  return session.baseURL.replace(/\/campus\/?$/, '');
}

function matchesDistrictFilters(district: string, options: CliOptions) {
  const host = district.toLowerCase();
  if (options.districts.length > 0 && !options.districts.some((text) => host.includes(text))) {
    return false;
  }
  return !options.excludeDistricts.some((text) => host.includes(text));
}

async function getRowDistrict(row: SessionRow) {
  try {
    return getDistrict(await unsealSession(row.session_token));
  } catch {
    return null;
  }
}

async function filterRowsByDistrict(rows: SessionRow[], options: CliOptions) {
  if (options.districts.length === 0 && options.excludeDistricts.length === 0) return rows;
  const districts = await Promise.all(rows.map(getRowDistrict));
  return rows.filter(
    (_, index) => districts[index] !== null && matchesDistrictFilters(districts[index]!, options)
  );
}

async function unsealSession(token: string): Promise<Session> {
  const ironKey = process.env.IRON_KEY;
  if (!ironKey) throw new Error('IRON_KEY is not set');

  const session = (await Iron.unseal(token, ironKey, Iron.defaults)) as Session;
  if (!session?.cookie || !session?.baseURL) {
    throw new Error('Stored token did not contain an IC cookie and base URL');
  }
  return session;
}

function mergeCookies(oldCookie: string, setCookieHeaders: string[]) {
  const cookieMap = new Map<string, string>();

  for (const part of oldCookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...valueParts] = trimmed.split('=');
    if (name) cookieMap.set(name, valueParts.join('='));
  }

  for (const header of setCookieHeaders) {
    const firstPart = header.split(';')[0];
    const [name, ...valueParts] = firstPart.trim().split('=');
    if (name) cookieMap.set(name, valueParts.join('='));
  }

  return [...cookieMap].map(([name, value]) => `${name}=${value}`).join('; ');
}

function getSetCookieHeaders(headers: Headers) {
  const candidate = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof candidate.getSetCookie === 'function') return candidate.getSetCookie();
  const setCookie = headers.get('set-cookie');
  return setCookie ? [setCookie] : [];
}

async function refreshICSession(session: Session): Promise<Session> {
  const appName = session.cookie.match(/(?:^|;)\s*appName=([^;]+)/)?.[1];
  if (!appName) throw new Error('Cannot refresh session: stored cookie has no appName');

  const cookieForBootstrap = `appType=student;campus_hybrid_app=student;deviceID=${session.deviceId};${session.cookie};`;
  let bootstrapResponse: Response;
  try {
    bootstrapResponse = await fetch(`https://${session.baseURL}/mobile/hybridAppUtil.jsp`, {
      method: 'POST',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieForBootstrap,
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      },
      body: new URLSearchParams({
        appName,
        deviceID: session.deviceId,
        deviceModel: session.deviceModel,
        deviceType: session.deviceType,
        systemVersion: session.systemVersion,
        appType: 'student',
        appVersion: '1.11.4',
        bootstrapped: '1',
        registrationToken: 'null',
      }).toString(),
      redirect: 'manual',
      signal: getRequestSignal(),
    });
  } catch (error) {
    throw new Error(
      `Session bootstrap failed (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const bootstrapCookie = mergeCookies(
    cookieForBootstrap,
    getSetCookieHeaders(bootstrapResponse.headers)
  );
  const xsrfToken = bootstrapCookie.match(/(?:^|;)\s*XSRF-TOKEN=([^;]+)/)?.[1] || '';
  const districtHost = session.baseURL.split('/')[0];
  const updateResponse = await fetch(`https://${session.baseURL}/api/campus/hybridDevice/update`, {
    method: 'POST',
    headers: {
      Host: districtHost,
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: `https://${districtHost}`,
      Cookie: bootstrapCookie,
      'x-xsrf-token': xsrfToken,
      'User-Agent':
        'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    },
    body: JSON.stringify({
      registrationToken: 'marks',
      deviceType: session.deviceType,
      deviceModel: `marks/${session.deviceModel}`,
      appVersion: '1.11.4',
      systemVersion: session.systemVersion,
      deviceID: session.deviceId,
      keepMeLoggedIn: true,
    }),
    signal: getRequestSignal(),
  });

  if (!updateResponse.ok) {
    throw new Error(
      `Session refresh failed: IC returned ${updateResponse.status} ${updateResponse.statusText}`
    );
  }

  const updatedCookie = mergeCookies(bootstrapCookie, getSetCookieHeaders(updateResponse.headers));
  const refreshedSession = { ...session, cookie: updatedCookie };
  const { account } = await fetchUserAccount(refreshedSession.baseURL, refreshedSession.cookie);
  return account
    ? { ...refreshedSession, userID: account.userID, personID: account.personID }
    : refreshedSession;
}

async function fetchJson<T>(session: Session, path: string): Promise<T> {
  const url = `https://${session.baseURL}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Cookie: session.cookie,
        'User-Agent':
          'StudentApp/1.11.4 Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      },
      signal: getRequestSignal(),
    });
  } catch (error) {
    throw new Error(
      `${path}: network failure (${error instanceof Error ? error.message : String(error)})`
    );
  }

  if (!response.ok)
    throw new Error(`${path}: IC returned ${response.status} ${response.statusText}`);

  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  if (!contentType.includes('json')) {
    throw new Error(`${path}: IC returned non-JSON content (session may be expired)`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${path}: IC returned invalid JSON`);
  }
}

async function settle<T>(promise: Promise<T>): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await promise };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

async function loadLiveSource(
  row: SessionRow,
  sessionRef: string,
  options: CliOptions
): Promise<GradeReportSource> {
  let session = await unsealSession(row.session_token);
  if (options.refresh) session = await refreshICSession(session);
  const [userResult, enrollmentResult, assignmentResult] = await Promise.all([
    settle(
      fetchUserAccount(session.baseURL, session.cookie).then(({ account, status }) => {
        if (!account) throw new Error(`user account: IC returned ${status}`);
        return account as userAccount;
      })
    ),
    settle(fetchJson<Enrollment[]>(session, '/resources/portal/grades')),
    settle(fetchJson<Assignment[]>(session, '/api/portal/assignment/listView')),
  ]);

  if (!enrollmentResult.data) {
    throw new Error(enrollmentResult.error || 'Unable to fetch grade enrollments');
  }

  const courses = extractCourseGrades(
    enrollmentResult.data,
    options.preferredTermID,
    options.preferredTaskID,
    options.now
  );
  const detailSectionIDs = new Set(
    courses
      .filter((course) => course.hasDetail || course.hasAssignments)
      .map((course) => course.sectionID)
  );
  if (options.saveFixtures) {
    // Capture every current-year section so fixtures can replay selection changes
    // that pick courses or terms the current logic does not.
    for (const sectionID of getRecentSectionIDs(enrollmentResult.data, options.now)) {
      detailSectionIDs.add(sectionID);
    }
  }
  const detailEntries = await mapConcurrent(
    [...detailSectionIDs],
    options.concurrency,
    async (sectionID) => {
      const detailResult = await settle(
        fetchJson<CourseGradeAPIResponse>(session, `/resources/portal/grades/detail/${sectionID}`)
      );
      const result: GradeDetailResult = detailResult.data
        ? {
            raw: detailResult.data,
            displayed: extractCourseGradeDetail(
              detailResult.data,
              options.preferredTermID,
              options.preferredTaskID,
              options.now
            ),
          }
        : { error: detailResult.error };
      return [sectionID, result] as const;
    }
  );

  const source: GradeReportSource = {
    sessionRef,
    district: getDistrict(session),
    user: userResult.data,
    userError: userResult.error,
    enrollments: enrollmentResult.data,
    assignments: assignmentResult.data,
    assignmentsError: assignmentResult.error,
    detailsBySection: new Map(detailEntries),
    responsiveSchedule: options.responsiveSchedule
      ? await auditResponsiveSchedule(
          enrollmentResult.data,
          <T>(path: string) => fetchJson<T>(session, path),
          Number(session.personID),
          options.preferredTermID,
          options.preferredTaskID,
          options.now
        )
      : undefined,
  };

  if (options.saveFixtures) await saveAnonymizedFixture(row, source, options.saveFixtures);
  return source;
}

const FIXTURE_LOOKBACK_DAYS = 150;

function getRecentSectionIDs(enrollments: Enrollment[], now = new Date()) {
  const cutoff = new Date(now.getTime() - FIXTURE_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return new Set(
    enrollments
      .flatMap((enrollment) => enrollment.terms || [])
      .filter((term) => term.endDate && term.endDate >= cutoff)
      .flatMap((term) => term.courses || [])
      .filter((course) => !course.dropped)
      .map((course) => course.sectionID)
  );
}

function anonymizeAssignment<T extends Record<string, any>>(assignment: T, index: number): T {
  return {
    ...assignment,
    assignmentName: `Assignment ${index + 1}`,
    courseName: assignment.courseName === undefined ? undefined : 'Course',
    comments: assignment.comments ? '[comment]' : null,
    feedback: assignment.feedback ? '[feedback]' : null,
  };
}

function anonymizeFixture(source: GradeReportSource, row: SessionRow): Fixture {
  const enrollments = source.enrollments.map((enrollment) => ({
    ...enrollment,
    // Keep only the school-year token that getCourseTerms reads from displayName.
    displayName: enrollment.displayName?.match(/\b(\d{2,4}\s*[-–]\s*\d{2,4})\b/)?.[1]
      ? `${enrollment.displayName.match(/\b(\d{2,4}\s*[-–]\s*\d{2,4})\b/)![1]} School`
      : 'School',
    terms: (enrollment.terms || []).map((term) => ({
      ...term,
      courses: (term.courses || []).map((course) => ({ ...course, teacherDisplay: 'Teacher' })),
    })),
  }));
  const details: Record<string, CourseGradeAPIResponse> = {};
  const detailErrors: Record<string, string> = {};
  for (const [sectionID, result] of source.detailsBySection) {
    if (result.error) detailErrors[sectionID] = result.error;
    if (!result.raw) continue;
    details[sectionID] = {
      terms: result.raw.terms,
      details: Array.isArray(result.raw.details)
        ? result.raw.details.map((detail) => ({
            task: { ...detail.task, comments: detail.task?.comments ? '[comment]' : null },
            categories: (detail.categories || []).map((category: any) => ({
              ...category,
              assignments: (category.assignments || []).map(anonymizeAssignment),
            })),
            children: null,
          }))
        : result.raw.details,
    };
  }

  return {
    sessionRef: `anon-${Bun.hash(row.uuid).toString(36)}`,
    district: source.district,
    enrollments,
    assignments: source.assignments?.map(anonymizeAssignment),
    assignmentsError: source.assignmentsError,
    details,
    detailErrors,
  };
}

async function saveAnonymizedFixture(row: SessionRow, source: GradeReportSource, dir: string) {
  const fixture = anonymizeFixture(source, row);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${source.district}__${fixture.sessionRef}.json`),
    JSON.stringify(fixture, null, 2)
  );
}

async function loadFixtureSource(path: string, options: CliOptions): Promise<GradeReportSource> {
  const fixture = JSON.parse(await readFile(path, 'utf8')) as Fixture;
  if (!Array.isArray(fixture.enrollments)) {
    throw new Error('Fixture must contain an enrollments array');
  }

  const detailsBySection = new Map<number, GradeDetailResult>();
  for (const [sectionID, raw] of Object.entries(fixture.details ?? {})) {
    detailsBySection.set(Number(sectionID), {
      raw,
      displayed: extractCourseGradeDetail(
        raw,
        options.preferredTermID,
        options.preferredTaskID,
        options.now
      ),
    });
  }
  for (const [sectionID, error] of Object.entries(fixture.detailErrors ?? {})) {
    detailsBySection.set(Number(sectionID), { error });
  }

  return {
    sessionRef: fixture.sessionRef || 'fixture',
    district: fixture.district || 'fixture.local',
    user: fixture.user,
    userError: fixture.userError,
    enrollments: fixture.enrollments,
    assignments: fixture.assignments,
    assignmentsError: fixture.assignmentsError,
    detailsBySection,
    responsiveSchedule: options.responsiveSchedule ? fixture.responsiveSchedule : undefined,
  };
}

function maskName(value: string) {
  if (!value) return value;
  return value.length === 1 ? '*' : `${value[0]}${'*'.repeat(Math.min(8, value.length - 1))}`;
}

function getSerializableReport(report: GradeReport, options: CliOptions) {
  const details = Object.fromEntries(
    Object.entries(report.details).map(([sectionID, result]) => [
      sectionID,
      options.includeRaw ? result : { displayed: result.displayed, error: result.error },
    ])
  );
  const user =
    !report.user || options.showIdentity
      ? report.user
      : {
          username: maskName(report.user.username),
          firstName: maskName(report.user.firstName),
          lastName: maskName(report.user.lastName),
        };

  return { ...report, user, details };
}

function reportHasErrors(report: GradeReport) {
  return report.issues.some((issue) => issue.severity === 'error');
}

function outputDetailedReport(report: GradeReport, options: CliOptions) {
  if (options.json) {
    console.log(JSON.stringify(getSerializableReport(report, options), null, 2));
  } else if (options.summary) {
    console.log(formatGradeReportSummary(report));
  } else {
    console.log(formatGradeReport(report, options));
  }
}

async function runBulk(rows: SessionRow[], options: CliOptions) {
  const results = await mapConcurrent(rows, options.concurrency, async (row) => {
    const sessionRef = options.showIdentifiers ? row.uuid : maskIdentifier(row.uuid);
    try {
      const source = await loadLiveSource(row, sessionRef, options);
      return { report: buildGradeReport(source, options) };
    } catch (error) {
      return {
        failure: {
          sessionRef,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  const reports = results.flatMap((result) => (result.report ? [result.report] : []));
  const failures = results.flatMap((result) => (result.failure ? [result.failure] : []));
  const issueCounts = new Map<string, number>();
  for (const report of reports) {
    for (const issue of report.issues) {
      if (issue.severity === 'info') continue;
      issueCounts.set(issue.code, (issueCounts.get(issue.code) || 0) + 1);
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          analyzed: reports.length,
          failed: failures.length,
          reports: reports.map((report) => ({
            sessionRef: report.sessionRef,
            district: report.district,
            courseCount: report.courses.length,
            assignmentCount: report.assignments.length,
            automaticTermIDs: report.automaticTermIDs,
            availability: report.availability,
            responsiveSchedule: report.responsiveSchedule
              ? scheduleSummary(report.responsiveSchedule)
              : undefined,
            issues: report.issues,
          })),
          failures,
          issueCounts: Object.fromEntries(issueCounts),
        },
        null,
        2
      )
    );
  } else {
    console.log(`MARKS LIVE BACKTEST — ${reports.length} analyzed, ${failures.length} failed`);
    for (const report of reports) console.log(formatGradeReportSummary(report));
    for (const failure of failures) {
      console.log(`${failure.sessionRef} | FAILED | ${failure.error}`);
    }
    console.log('');
    console.log('ISSUE TOTALS');
    if (issueCounts.size === 0) console.log('none');
    for (const [code, count] of [...issueCounts].sort((left, right) => right[1] - left[1])) {
      console.log(`${code}=${count}`);
    }
  }

  if (options.failOnIssues && (failures.length > 0 || reports.some(reportHasErrors))) {
    process.exitCode = 2;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = options.mode!;

  if (mode.kind === 'fixture') {
    const source = await loadFixtureSource(mode.path, options);
    const report = buildGradeReport(source, options);
    outputDetailedReport(report, options);
    if (options.failOnIssues && reportHasErrors(report)) process.exitCode = 2;
    return;
  }

  if (mode.kind === 'list') {
    const sessionIdentifiers = await getSessionIdentifiers();
    const identifiers = sessionIdentifiers.map((identifier) =>
      options.showIdentifiers ? identifier : maskIdentifier(identifier)
    );
    if (options.json) console.log(JSON.stringify(identifiers, null, 2));
    else {
      console.log(`Stored sessions (${identifiers.length})`);
      for (const identifier of identifiers) console.log(`  ${identifier}`);
    }
    return;
  }

  if (mode.kind === 'districts') {
    const rows = await getSessionRows();
    const districts = await Promise.all(rows.map(getRowDistrict));
    const counts = new Map<string, number>();
    for (const district of districts) {
      const key = district ?? '<unsealable>';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts].sort((left, right) => right[1] - left[1]);
    if (options.json) console.log(JSON.stringify(Object.fromEntries(sorted), null, 2));
    else {
      console.log(
        `Stored sessions by district (${rows.length} sessions, ${counts.size} districts)`
      );
      for (const [district, count] of sorted) console.log(`  ${count}\t${district}`);
    }
    return;
  }

  if (mode.kind === 'uuid') {
    const row = await getSessionRow(mode.uuid);
    if (!row) throw new Error(`No ic_sessions row found for UUID ${mode.uuid}`);
    const sessionRef = options.showIdentifiers ? row.uuid : maskIdentifier(row.uuid);
    const source = await loadLiveSource(row, sessionRef, options);
    const report = buildGradeReport(source, options);
    outputDetailedReport(report, options);
    if (options.failOnIssues && reportHasErrors(report)) process.exitCode = 2;
    return;
  }

  const hasDistrictFilter = options.districts.length > 0 || options.excludeDistricts.length > 0;
  const rows =
    mode.kind === 'recent' && !hasDistrictFilter
      ? await getRecentSessionRows(mode.count)
      : await filterRowsByDistrict(await getSessionRows(), options);
  const selectedRows =
    mode.kind === 'sample'
      ? shuffle(rows).slice(0, mode.count)
      : mode.kind === 'recent' && hasDistrictFilter
        ? [...rows]
            .sort((left, right) => (right.updated_at || '').localeCompare(left.updated_at || ''))
            .slice(0, mode.count)
        : rows;
  await runBulk(selectedRows, options);
}

main().catch((error) => {
  console.error(`grade-report: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
