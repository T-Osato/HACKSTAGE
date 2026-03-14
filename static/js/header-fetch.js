// ヘッダーの読み込み
fetch('../templates/header.html')
    .then(response => response.text())
    .then(data => {
        document.getElementById('header').innerHTML = data;

        const script = document.createElement("script");
        script.src = "../static/js/header_script.js";
        document.body.appendChild(script);
    });