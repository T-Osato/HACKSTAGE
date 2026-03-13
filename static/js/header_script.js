function to_mypage() {
    location.href = "/dashboard.html";
}

function logout() {
    localStorage.removeItem("username");
    location.href = "login.html";
}
