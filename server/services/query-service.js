export function createQueryService({ plantRepo, dishRepo, eventRepo }) {
  return {
    getPlants(query) {
      return plantRepo.findAll(query);
    },
    getDishes(query) {
      return dishRepo.findAll(query);
    },
    getEvents(filters) {
      return eventRepo.findAll(filters);
    },
  };
}
