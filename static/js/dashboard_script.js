//ボタンとメニューを取得
const menuBtn = document.getElementById('js-button');
const menuNav = document.getElementById('js-nav');

//ボタンをクリックした時の処理
menuBtn.addEventListener('click',() =>{
    //'open'クラスを付けたり消したりする
    menuNav.classList.toggle('open');
});