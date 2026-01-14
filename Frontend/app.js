const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginSection = document.getElementById("login-section");
const dashboard = document.getElementById("dashboard");
const categories = document.querySelectorAll(".category");
const videosSection = document.getElementById("videos-section");

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const response = await fetch("http://localhost:3001/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      loginSection.classList.add("hidden");
      dashboard.classList.remove("hidden");
      loginError.textContent = "";
    } else {
      loginError.textContent = result.message || "Login failed.";
    }
  } catch (error) {
    console.error("Login error:", error);
    loginError.textContent = "Server error. Try again later.";
  }
});

const videoData = {
  "BH": [
    {
      title: "BH Orientation",
      desc: "Introduction to BH department",
      img: "https://via.placeholder.com/300x150.png?text=BH+Intro",
      link: "#"
    }
  ],
  "NE": [
    {
      title: "NE Basics",
      desc: "Getting started with NE tools",
      img: "https://via.placeholder.com/300x150.png?text=NE+Basics",
      link: "#"
    }
  ],
  "NE-PRO": [
    {
      title: "NE PRO Training",
      desc: "Advanced professional tools overview",
      img: "https://via.placeholder.com/300x150.png?text=NE+PRO",
      link: "#"
    }
  ],
  "Competencies": [
    {
      title: "Core Competencies",
      desc: "Company-wide essential skills",
      img: "https://via.placeholder.com/300x150.png?text=Competency",
      link: "#"
    }
  ],
  "Policies": [
    {
      title: "Code of Conduct",
      desc: "Important rules and policies",
      img: "https://via.placeholder.com/300x150.png?text=Policies",
      link: "#"
    }
  ]
};

categories.forEach(cat => {
  cat.addEventListener("click", () => {
    const key = cat.dataset.cat;
    const videos = videoData[key];

    videosSection.innerHTML = "";

    videos.forEach(video => {
      const card = document.createElement("div");
      card.className = "video-card";
      card.innerHTML = `
        <img src="${video.img}" alt="${video.title}" />
        <h3>${video.title}</h3>
        <p>${video.desc}</p>
        <a href="${video.link}" target="_blank">Watch Video</a>
      `;
      videosSection.appendChild(card);
    });
  });
});
