function checkPassword() {
            const p1 = document.getElementById("pass1").value;
            const p2 = document.getElementById("pass2").value;
            if (p1 !== p2) {
                alert("パスワードが一致しません");
                return false; // 送信をキャンセル
            }
            return true;
        }