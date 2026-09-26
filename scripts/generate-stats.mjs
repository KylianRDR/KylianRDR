import fs from "node:fs/promises";

const username = "kylianrdr";
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN is missing.");
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  return response.json();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createSvg({ title, width = 495, height = 180, body }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    x="0.5"
    y="0.5"
    width="${width - 1}"
    height="${height - 1}"
    rx="10"
    fill="#0d1117"
    stroke="#30363d"
  />

  <text
    x="25"
    y="38"
    fill="#f0f6fc"
    font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
    font-size="18"
    font-weight="600"
  >
    ${escapeXml(title)}
  </text>

  ${body}
</svg>`;
}

async function getRepositories() {
  const repositories = [];

  for (let page = 1; page <= 10; page++) {
    const data = await github(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member&sort=updated`,
    );

    repositories.push(...data);

    if (data.length < 100) {
      break;
    }
  }

  return repositories;
}

async function getUser() {
  return github(`https://api.github.com/user`);
}

function createStatsSvg(user, repositories) {
  const ownedRepositories = repositories.filter(
    (repo) => repo.owner?.login === username,
  );

  const stars = ownedRepositories.reduce(
    (total, repo) => total + repo.stargazers_count,
    0,
  );

  const forks = ownedRepositories.reduce(
    (total, repo) => total + repo.forks_count,
    0,
  );

  const privateRepositories = ownedRepositories.filter(
    (repo) => repo.private,
  ).length;

  const publicRepositories = ownedRepositories.filter(
    (repo) => !repo.private,
  ).length;

  const body = `
    <g
      font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
    >
      <text x="25" y="75" fill="#8b949e" font-size="13">
        Repositories
      </text>
      <text x="25" y="98" fill="#f0f6fc" font-size="20" font-weight="600">
        ${ownedRepositories.length}
      </text>

      <text x="180" y="75" fill="#8b949e" font-size="13">
        Public
      </text>
      <text x="180" y="98" fill="#f0f6fc" font-size="20" font-weight="600">
        ${publicRepositories}
      </text>

      <text x="335" y="75" fill="#8b949e" font-size="13">
        Private
      </text>
      <text x="335" y="98" fill="#f0f6fc" font-size="20" font-weight="600">
        ${privateRepositories}
      </text>

      <text x="25" y="135" fill="#8b949e" font-size="13">
        Stars
      </text>
      <text x="25" y="158" fill="#f0f6fc" font-size="20" font-weight="600">
        ${stars}
      </text>

      <text x="180" y="135" fill="#8b949e" font-size="13">
        Forks
      </text>
      <text x="180" y="158" fill="#f0f6fc" font-size="20" font-weight="600">
        ${forks}
      </text>

      <text x="335" y="135" fill="#8b949e" font-size="13">
        Followers
      </text>
      <text x="335" y="158" fill="#f0f6fc" font-size="20" font-weight="600">
        ${user.followers}
      </text>
    </g>
  `;

  return createSvg({
    title: "GitHub Statistics",
    body,
  });
}

function createLanguagesSvg(repositories) {
  const languages = new Map();

  for (const repo of repositories) {
    if (repo.fork) continue;

    const language = repo.language;

    if (!language) continue;

    languages.set(language, (languages.get(language) || 0) + 1);
  }

  const sorted = [...languages.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const total = sorted.reduce((sum, [, count]) => sum + count, 0);

  const rows = sorted
    .map(([language, count], index) => {
      const percentage = total ? Math.round((count / total) * 100) : 0;

      const y = 70 + index * 20;
      const barWidth = Math.max(5, Math.round((percentage / 100) * 210));

      return `
        <g
          font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
        >
          <text
            x="25"
            y="${y}"
            fill="#c9d1d9"
            font-size="12"
          >
            ${escapeXml(language)}
          </text>

          <rect
            x="125"
            y="${y - 10}"
            width="210"
            height="8"
            rx="4"
            fill="#21262d"
          />

          <rect
            x="125"
            y="${y - 10}"
            width="${barWidth}"
            height="8"
            rx="4"
            fill="#58a6ff"
          />

          <text
            x="350"
            y="${y}"
            fill="#8b949e"
            font-size="12"
          >
            ${percentage}%
          </text>
        </g>
      `;
    })
    .join("");

  return createSvg({
    title: "Top Languages",
    height: 250,
    body: rows,
  });
}

function createStreakSvg() {
  const contributions = [
    "Contributions are tracked",
    "directly through GitHub",
    "and refreshed automatically",
  ];

  const body = contributions
    .map(
      (line, index) => `
        <text
          x="25"
          y="${75 + index * 25}"
          fill="${index === 0 ? "#f0f6fc" : "#8b949e"}"
          font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
          font-size="${index === 0 ? 16 : 14}"
          font-weight="${index === 0 ? 600 : 400}"
        >
          ${escapeXml(line)}
        </text>
      `,
    )
    .join("");

  return createSvg({
    title: "Contribution Activity",
    body,
  });
}

await fs.mkdir("profile", { recursive: true });

const user = await getUser();
const repositories = await getRepositories();

const stats = createStatsSvg(user, repositories);
const languages = createLanguagesSvg(repositories);
const streak = createStreakSvg();

await fs.writeFile("profile/stats.svg", stats);
await fs.writeFile("profile/top-langs.svg", languages);
await fs.writeFile("profile/streak.svg", streak);

console.log(
  `Generated statistics for ${username}: ${repositories.length} repositories found.`,
);
