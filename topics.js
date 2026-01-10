export const topics = [
  {
    id: "meat-consumed",
    name: "Top 10 Meats Consumed (Worldwide)",
    items: [
      "Chicken",
      "Pork",
      "Beef",
      "Fish",
      "Turkey",
      "Duck",
      "Lamb",
      "Goat",
      "Venison",
      "Rabbit"
    ]
  },
  {
    id: "video-game-systems",
    name: "Top 10 Grossing Video Game Systems",
    items: [
      "PlayStation 2",
      "Nintendo DS",
      "Nintendo Switch",
      "Game Boy",
      "PlayStation 4",
      "PlayStation",
      "Wii",
      "Xbox 360",
      "Game Boy Advance",
      "PlayStation Portable"
    ]
  },
  {
    id: "fast-food",
    name: "Top 10 Fast-Food Chains",
    items: [
      "McDonald's",
      "Subway",
      "Starbucks",
      "KFC",
      "Burger King",
      "Taco Bell",
      "Wendy's",
      "Dunkin'",
      "Chick-fil-A",
      "Domino's"
    ]
  },
  {
    id: "blockbuster-movies",
    name: "Top 10 All-Time Box Office Movies",
    items: [
      "Avatar",
      "Avengers: Endgame",
      "Titanic",
      "Star Wars: The Force Awakens",
      "Avengers: Infinity War",
      "Spider-Man: No Way Home",
      "Jurassic World",
      "The Lion King (2019)",
      "The Avengers",
      "Furious 7"
    ]
  }
];

export const topicMap = topics.reduce((acc, topic) => {
  acc[topic.id] = topic;
  return acc;
}, {});
