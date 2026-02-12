export function createPlantRepo(db) {
  const stmts = {
    findById: db.prepare('SELECT * FROM plants WHERE id = ?'),
    insert: db.prepare(
      'INSERT INTO plants (id, type, stage, status, dishId) VALUES (?, ?, ?, ?, ?)'
    ),
    updateStatus: db.prepare('UPDATE plants SET status = ? WHERE id = ?'),
    updateDishId: db.prepare('UPDATE plants SET dishId = ? WHERE id = ?'),
    delete: db.prepare('DELETE FROM plants WHERE id = ?'),
    maxNum: db.prepare(
      "SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) as maxNum FROM plants WHERE id LIKE 'P-%'"
    ),
    findAll: db.prepare('SELECT * FROM plants'),
    search: db.prepare('SELECT * FROM plants WHERE id LIKE ? OR type LIKE ?'),
  };

  return {
    findById(id) {
      return stmts.findById.get(id);
    },
    insert({ id, type, stage, status, dishId }) {
      stmts.insert.run(id, type, stage, status, dishId);
    },
    updateStatus(status, id) {
      stmts.updateStatus.run(status, id);
    },
    updateDishId(dishId, id) {
      stmts.updateDishId.run(dishId, id);
    },
    delete(id) {
      stmts.delete.run(id);
    },
    nextId() {
      return `P-${(stmts.maxNum.get().maxNum || 0) + 1}`;
    },
    findAll(query) {
      if (query) {
        return stmts.search.all(`%${query}%`, `%${query}%`);
      }
      return stmts.findAll.all();
    },
  };
}
