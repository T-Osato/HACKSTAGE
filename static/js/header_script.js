function to_mypage() {
    location.href = "/dashboard";
}

function logout() {
    location.href = "/logout";
}

const menuButton = document.getElementById("menu-button");
const overlay = document.getElementById("overlay");
const sidemenu = document.getElementById("sidemenu");

menuButton.addEventListener("click", () => {
    menuButton.classList.toggle("active");
    overlay.classList.toggle("active");
    sidemenu.classList.toggle("active");
});

overlay.addEventListener("click", () => {
    menuButton.classList.remove("active");
    overlay.classList.remove("active");
    sidemenu.classList.remove("active");
});


