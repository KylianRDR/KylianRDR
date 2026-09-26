import fs from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME || "KylianRDR";

if (!token) {
  throw new Error("GITHUB_TOKEN is missing.");
}

const endpoint = "https://api.github.com/graphql";

async function githubGraphQL(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "KylianRDR-profile-stats",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub GraphQL HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(
      `GitHub GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  return json.data;
}

const userQuery = `
query Profile($login: String!) {
  user(login: $login) {
    login
    name
    followers {
      totalCount
    }
    repositories(
      first: 100
      ownerAffiliations: OWNER
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      totalCount
      nodes {
        name
        isPrivate
        isFork
        stargazerCount
        forkCount
        primaryLanguage {
          name
        }
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges {
            size
            node {
              name
            }
          }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalRepositoryContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
          }
        }
      }
    }
  }
}
`;

console.log(`Fetching GitHub statistics for ${username}...`);

const data = await githubGraphQL(userQuery, {
  login: username,
});

const user = data.user;

if (!user) {
  throw new Error(`GitHub user "${username}" not found.`);
}

const contributions = user.contributionsCollection;
const calendar = contributions.contributionCalendar;

const days = calendar.weeks.flatMap((week) => week.contributionDays);

function calculateStreaks(days) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  const activeDays = sorted.filter((day) => day.contributionCount > 0);

  let longest = 0;
  let current = 0;

  for (let i = 0; i < activeDays.length; i++) {
    if (i === 0) {
      current = 1;
    } else {
      const previous = new Date(`${activeDays[i - 1].date}T00:00:00Z`);
      const currentDate = new Date(`${activeDays[i].date}T00:00:00Z`);

      const diff = (currentDate - previous) / (1000 * 60 * 60 * 24);

      if (diff === 1) {
        current++;
      } else {
        current = 1;
      }
    }

    longest = Math.max(longest, current);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const dateMap = new Map(
    sorted.map((day) => [day.date, day.contributionCount]),
  );

  let cursor = today;

  const todayKey = cursor.toISOString().slice(0, 10);

  if (!dateMap.get(todayKey)) {
    cursor = yesterday;
  }

  let currentStreak = 0;

  while (true) {
    const key = cursor.toISOString().slice(0, 10);

    if (!dateMap.get(key)) {
      break;
    }

    currentStreak++;

    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return {
    current: currentStreak,
    longest,
  };
}

const streak = calculateStreaks(days);

const languages = new Map();

for (const repo of user.repositories.nodes) {
  if (repo.isFork) continue;

  for (const edge of repo.languages.edges) {
    const name = edge.node.name;
    const size = edge.size;

    languages.set(name, (languages.get(name) || 0) + size);
  }
}

const topLanguages = [...languages.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8);

const totalLanguageBytes = topLanguages.reduce(
  (sum, [, size]) => sum + size,
  0,
);

const languageRows = topLanguages.map(([name, size]) => {
  const percentage =
    totalLanguageBytes > 0
      ? ((size / totalLanguageBytes) * 100).toFixed(1)
      : "0.0";

  return {
    name,
    percentage,
  };
});

const repoCount = user.repositories.totalCount;

const publicRepos = user.repositories.nodes.filter(
  (repo) => !repo.isPrivate,
).length;

const privateRepos = user.repositories.nodes.filter(
  (repo) => repo.isPrivate,
).length;

const totalStars = user.repositories.nodes.reduce(
  (sum, repo) => sum + repo.stargazerCount,
  0,
);

const totalForks = user.repositories.nodes.reduce(
  (sum, repo) => sum + repo.forkCount,
  0,
);

const stats = {
  contributions: calendar.totalContributions,
  commits: contributions.totalCommitContributions,
  pullRequests: contributions.totalPullRequestContributions,
  issues: contributions.totalIssueContributions,
  repositories: repoCount,
  publicRepositories: publicRepos,
  privateRepositories: privateRepos,
  stars: totalStars,
  forks: totalForks,
  followers: user.followers.totalCount,
  restrictedContributions: contributions.restrictedContributionsCount,
  currentStreak: streak.current,
  longestStreak: streak.longest,
};

console.log("\nGitHub statistics:");
console.table(stats);

console.log("\nTop languages:");
console.table(languageRows);

await fs.mkdir("profile", { recursive: true });

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgDocument(width, height, body) {
  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  role="img"
>
  <rect
    width="100%"
    height="100%"
    rx="14"
    fill="#0d1117"
    stroke="#30363d"
  />
  ${body}
</svg>
`.trim();
}

function text(x, y, value, size = 14, weight = 400, fill = "#e6edf3") {
  return `
<text
  x="${x}"
  y="${y}"
  fill="${fill}"
  font-family="Arial, Helvetica, sans-serif"
  font-size="${size}px"
  font-weight="${weight}"
>
  ${escapeXml(value)}
</text>`;
}

const statsItems = [
  ["Contributions", stats.contributions],
  ["Commits", stats.commits],
  ["Pull Requests", stats.pullRequests],
  ["Issues", stats.issues],
  ["Repositories", stats.repositories],
  ["Stars", stats.stars],
];

const statsBody = [
  text(28, 38, "GitHub Statistics", 18, 700),
  ...statsItems.flatMap(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);

    const x = 28 + column * 165;
    const y = 82 + row * 65;

    return [
      text(x, y, String(value), 24, 700),
      text(x, y + 23, label, 12, 400, "#8b949e"),
    ];
  }),
];

await fs.writeFile("profile/stats.svg", svgDocument(520, 220, statsBody));

const streakBody = [
  text(28, 38, "Contribution Streak", 18, 700),

  text(28, 92, String(stats.currentStreak), 30, 700),
  text(28, 116, "Current streak", 12, 400, "#8b949e"),

  text(190, 92, String(stats.longestStreak), 30, 700),
  text(190, 116, "Longest streak", 12, 400, "#8b949e"),

  text(350, 92, String(stats.restrictedContributions), 30, 700),
  text(350, 116, "Private contributions", 12, 400, "#8b949e"),
];

await fs.writeFile("profile/streak.svg", svgDocument(520, 155, streakBody));

const languageBody = [text(28, 38, "Top Languages", 18, 700)];

languageRows.forEach((language, index) => {
  const y = 70 + index * 31;

  languageBody.push(
    text(28, y, language.name, 13, 600),
    text(420, y, `${language.percentage}%`, 13, 400, "#8b949e"),
  );

  languageBody.push(`
    <rect
      x="28"
      y="${y + 8}"
      width="420"
      height="5"
      rx="3"
      fill="#21262d"
    />
  `);

  languageBody.push(`
    <rect
      x="28"
      y="${y + 8}"
      width="${Math.max(2, (420 * Number(language.percentage)) / 100)}"
      height="5"
      rx="3"
      fill="#58a6ff"
    />
  `);
});

await fs.writeFile(
  "profile/top-langs.svg",
  svgDocument(480, 80 + languageRows.length * 31, languageBody),
);

console.log("\nGenerated:");
console.log("  profile/stats.svg");
console.log("  profile/top-langs.svg");
console.log("  profile/streak.svg");
