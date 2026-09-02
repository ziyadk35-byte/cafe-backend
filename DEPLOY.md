# تشغيل الباك اند على السيرفر بشكل دائم (Deployment Guide)

## 1. رفع الكود للسيرفر
من جهازك، ارفع مجلد `cafe-backend` بالكامل عن طريق `scp` أو `git`:
```
scp -r cafe-backend username@server_ip:/home/username/
```
أو لو الكود على GitHub:
```
ssh username@server_ip
git clone https://github.com/your-repo/cafe-backend.git
```

## 2. تثبيت المتطلبات على السيرفر
```
ssh username@server_ip
cd cafe-backend
npm install
```

## 3. إعداد المتغيرات البيئية
```
cp .env.example .env
nano .env
```
املأ القيم الحقيقية: MONGO_URI (استخدم MongoDB Atlas الأسهل)، JWT_SECRET، بيانات Paymob.

## 4. تثبيت PM2 (يخلي السيرفر يشتغل دايمًا حتى بعد إعادة تشغيل السيرفر)
```
sudo npm install -g pm2
pm2 start server.js --name cafe-backend
pm2 save
pm2 startup   # نفذ الأمر اللي هيطلعهولك بعد كده عشان يشتغل تلقائي بعد أي reboot
```

## 5. إعداد Nginx كـ reverse proxy (اختياري لكن موصى به)
```
sudo apt install nginx
sudo nano /etc/nginx/sites-available/cafe-backend
```
محتوى الملف:
```
server {
    listen 80;
    server_name your_domain_or_ip;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
```
sudo ln -s /etc/nginx/sites-available/cafe-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 6. تفعيل HTTPS (مهم لـ Paymob ولـ React Native في الإنتاج)
```
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com
```

## 7. أوامر مفيدة بعد كده
```
pm2 logs cafe-backend     # متابعة اللوجز لحظيًا
pm2 restart cafe-backend  # إعادة تشغيل بعد أي تعديل في الكود
pm2 status                # التأكد إنه شغال
```

## ملاحظة عن Paymob Webhook
لازم تدخل رابط الـ webhook في لوحة تحكم Paymob:
`https://your_domain.com/api/orders/paymob/webhook`
وده اللي بيحدّث حالة الدفع لما العميل يخلص الدفع فعليًا.
