export function sortByDate(a: any, b: any) {
  return new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime();
}
