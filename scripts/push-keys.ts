/** 웹 푸시 VAPID 키 생성 — 출력된 두 줄을 .env 에 넣으면 푸시 알림이 켜진다. 키를 바꾸면 기존 구독은 모두 다시 받아야 한다. */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
