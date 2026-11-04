export function parseSchoolLogin(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith('/campus/')
  ) {
    throw new Error('Use the full HTTPS link for your school’s Infinite Campus login page.');
  }
  const appName = url.pathname
    .split('/')
    .slice(-1)[0]
    ?.replace(/\.jsp$/, '');
  if (!appName || !url.pathname.endsWith('.jsp')) {
    throw new Error('Paste your school’s full login link, ending in .jsp.');
  }
  url.search = '';
  url.hash = '';
  return {
    uri: url
      .toString()
      .replace('/campus/portal/', '/campus/portal/students/')
      .replace('/students/students/', '/students/'),
    districtAppName: appName,
  };
}
