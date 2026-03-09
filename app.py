#メインプログラム

#インポート関連
from flask import Flask,request,redirect,url_for,render_template
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager,UserMixin,login_user,current_user,logout_user
from werkzeug.security import generate_password_hash, check_password_hash
import os
from datetime import datetime,timezone

#インスタンスの作成
app: Flask = Flask(__name__)

#データベースの設定
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///db.sqlite'
app.config['SECRET_KEY'] = 'your-secret-key'
db = SQLAlchemy(app)

#ログイン情報のデータベースモデル
class User(db.Model,UserMixin):
    __tablename__ = 'users'

    #1.識別用のID（自動割り振り）
    id = db.Column(db.Integer, primary_key=True)

    #2.学籍番号(一意)
    student_number = db.Column(db.String(20), unique=True, nullable=False)

    #3.パスワード（ハッシュ化したものを入れる）
    password_hash = db.Column(db.String(255), nullable=False)

    #4.ユーザー名
    name = db.Column(db.String(50),nullable=False)

    #作成日時
    created_at = db.Column(db.DateTime, default=lambda:datetime.now(timezone.utc))

with app.app_context():
    db.create_all()


@app.route('/',methods = ['GET','POST'])
def login():
    if request.method == "GET":
        return render_template("login.html")

@app.route('/signup',methods = ['GET','POST'])
def signup():
    if request.method == "GET":
        return render_template("signup.html")
    elif request.method == "POST":
        username = request.form.get('username')
        password = request.form.get('password')

        #Userインスタンスを作成
        user = User(username = username, password=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()
        return redirect('login')

#アプリ実行
if __name__ == "__main__":
    app.run(debug=True)