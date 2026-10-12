import subprocess, json, secrets, os, sys
F=sys.argv[1]; OUT="out"; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
rates=[64,64,96,96,128,128,160,160,192,192]
tracks=[2,1,4,3,5,2,1,4,3,5]
starts=[0.5,0.5,0.5,0.5,0.5,7.5,7.5,7.5,7.5,7.5]
def run(*a): subprocess.run([F,"-hide_banner","-loglevel","error","-y",*a],check=True)
rounds=[]
for i,(tr,br,st) in enumerate(zip(tracks,rates,starts),1):
    src=f"t{tr}.wav"; mp3=f"tmp-{tr}-{br}.mp3"; dec=f"tmp-{tr}-{br}.wav"
    if not os.path.exists(dec):
        run("-i",src,"-c:a","libmp3lame","-b:a",f"{br}k",mp3); run("-i",mp3,dec)
    af="afade=t=in:d=0.02,afade=t=out:st=5.97:d=0.03"
    ids={}
    for kind,inp in [("orig",src),("comp",dec)]:
        name=f"r{i}-{secrets.token_hex(4)}.wav"
        # WAV(무압축)로 두 버전 크기를 똑같게 — 파일 크기로 정답이 드러나지 않게
        run("-ss",str(st),"-t","6","-i",inp,"-af",af,"-ar","44100","-ac","2","-c:a","pcm_s16le",os.path.join(OUT,name))
        ids[kind]=name
    rounds.append({"kbps":br,**ids})
json.dump(rounds,open("rounds.json","w"),indent=1)
for r in rounds: print(r["kbps"], os.path.getsize(os.path.join(OUT,r["orig"]))//1024, os.path.getsize(os.path.join(OUT,r["comp"]))//1024)
