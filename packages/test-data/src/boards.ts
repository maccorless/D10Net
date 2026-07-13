const cities = [
  "Tokyo",
  "Delhi",
  "Shanghai",
  "Dhaka",
  "Sao Paulo",
  "Mexico City",
  "Cairo",
  "Beijing",
  "Mumbai",
  "Osaka",
  "Chongqing",
  "Karachi",
  "Kinshasa",
  "Lagos",
  "Istanbul",
  "Buenos Aires",
  "Kolkata",
  "Manila",
  "Guangzhou",
  "Tianjin",
  "Lahore",
  "Bangalore",
  "Rio de Janeiro",
  "Shenzhen",
  "Moscow",
  "Chennai",
  "Bogota",
  "Paris",
  "Jakarta",
  "Lima",
  "Bangkok",
  "Hyderabad",
  "Seoul",
  "Nagoya",
  "London",
  "Chengdu",
  "Nanjing",
  "Tehran",
  "Ho Chi Minh City",
  "Luanda",
  "Wuhan",
  "Xi'an",
  "Ahmedabad",
  "Kuala Lumpur",
  "New York City",
  "Hangzhou",
  "Surat",
  "Suzhou",
  "Hong Kong",
  "Riyadh",
];

// Board where cities 9 and 10 share rank 9 (standard competition ranking),
// and city-11 is also a universe item tied at rank 9 but not in ranked[].
export const validBoardWithTiedTenth = {
  id: "cities-with-tie",
  version: 1,
  gameDay: null,
  title: "Largest Cities (Tie at 9)",
  prompt: "Rank the top cities",
  metricDesc: "Population",
  tags: ["geography"],
  rankingSource: { name: "UN", url: "https://www.un.org/" },
  universeSource: { name: "UN", url: "https://www.un.org/" },
  universe: cities.map((label, index) => {
    // Cities 0–7: ranks 1–8. Cities 8, 9, 10: all tied at rank 9. Rest: no rank.
    if (index < 8)
      return {
        id: `city-${index + 1}`,
        label,
        aliases: [],
        metricValue: `${37 - index}M`,
        rank: index + 1,
      };
    if (index < 11)
      return {
        id: `city-${index + 1}`,
        label,
        aliases: [],
        metricValue: "28M",
        rank: 9,
      };
    return { id: `city-${index + 1}`, label, aliases: [] };
  }),
  // ranked contains exactly 10: ranks 1–8 plus two of the three tied rank-9 cities
  ranked: cities.slice(0, 10).map((_, index) => `city-${index + 1}`),
};

export const validCitiesBoard = {
  id: "largest-cities",
  version: 1,
  gameDay: null,
  title: "Largest Cities",
  prompt: "Rank the 10 largest cities by urban agglomeration population",
  metricDesc: "Population of the urban agglomeration",
  tags: ["geography"],
  rankingSource: { name: "United Nations", url: "https://www.un.org/" },
  universeSource: { name: "United Nations", url: "https://www.un.org/" },
  universe: cities.map((label, index) => ({
    id: `city-${index + 1}`,
    label,
    aliases: [],
    ...(index < 10
      ? { metricValue: `${37 - index} million`, rank: index + 1 }
      : {}),
  })),
  ranked: cities.slice(0, 10).map((_, index) => `city-${index + 1}`),
};
