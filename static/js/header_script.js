function to_mypage() {
    location.href = "/dashboard";
}

function to_setting() {
    location.href = "/setting";
}

function logout() {
    location.href = "/logout";
}

const menuButton = document.getElementById("menu-button");
const overlay = document.getElementById("overlay");
const sidemenu = document.getElementById("sidemenu");
const headerDiv = document.getElementById("header");
const userNameSpan = document.getElementById("user-name");
const nameDisplaySpan = document.querySelector(".name-display");

// 名前をセット（data-user-name属性から取得）
if (headerDiv && headerDiv.dataset.userName) {
    const name = headerDiv.dataset.userName;
    if (userNameSpan) userNameSpan.textContent = name;
    if (nameDisplaySpan) nameDisplaySpan.textContent = name;
}

if (menuButton) {
    menuButton.addEventListener("click", () => {
        menuButton.classList.toggle("active");
        overlay.classList.toggle("active");
        sidemenu.classList.toggle("active");
    });
}

if (overlay) {
    overlay.addEventListener("click", () => {
        menuButton.classList.remove("active");
        overlay.classList.remove("active");
        sidemenu.classList.remove("active");
    });
}
