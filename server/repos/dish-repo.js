export function createDishRepo(db) {
  const stmts = {
    findById: db.prepare('SELECT * FROM dishes WHERE id = ?'),
    exists: db.prepare('SELECT 1 FROM dishes WHERE id = ?'),
    insert: db.prepare('INSERT INTO dishes (id, plantId) VALUES (?, ?)'),
    delete: db.prepare('DELETE FROM dishes WHERE id = ?'),
    maxNum: db.prepare(
      "SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) as maxNum FROM dishes WHERE id LIKE 'D-%'"
    ),
    findAll: db.prepare('SELECT * FROM dishes'),
    search: db.prepare('SELECT * FROM dishes WHERE id LIKE ?'),
  };

  return {
    findById(id) {
      return stmts.findById.get(id);
    },
    exists(id) {
      return !!stmts.exists.get(id);
    },
    insert({ id, plantId }) {
      stmts.insert.run(id, plantId);
    },
    delete(id) {
      stmts.delete.run(id);
    },
    nextId() {
      return `D-${(stmts.maxNum.get().maxNum || 0) + 1}`;
    },
    findAll(query) {
      if (query) {
        return stmts.search.all(`%${query}%`);
      }
      return stmts.findAll.all();
    },
  };
}
