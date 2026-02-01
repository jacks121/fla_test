export function normalizeParentIds(queue, bulkValue) {
  const parents = Array.isArray(queue) ? [...queue] : [];
  const bulkList = (bulkValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  bulkList.forEach((id) => {
    if (!parents.includes(id)) parents.push(id);
  });
  return parents;
}
