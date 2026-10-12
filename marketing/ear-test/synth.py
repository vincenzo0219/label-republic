import numpy as np, wave, sys
SR=44100
rng=np.random.default_rng(7)
def t(n): return np.arange(n)/SR
def env(n,a=0.005,d=0.3):
    x=t(n); e=np.minimum(1,x/a)*np.exp(-x/d); return e
def place(buf,sig,start,pan=0.0,gain=1.0):
    s=int(start*SR); e=min(len(buf),s+len(sig)); sig=sig[:e-s]*gain
    l=np.cos((pan+1)*np.pi/4); r=np.sin((pan+1)*np.pi/4)
    buf[s:e,0]+=sig*l; buf[s:e,1]+=sig*r
def midi(m): return 440*2**((m-69)/12)
def piano(f,dur=1.6,bright=1.0):
    n=int(dur*SR); x=t(n); s=np.zeros(n)
    for k in range(1,14):
        fk=f*k*np.sqrt(1+0.0004*k*k)
        if fk>19000: break
        s+=np.sin(2*np.pi*fk*x+rng.random()*6)*(1/k**(1.3/bright))*np.exp(-x*(0.8+0.5*k))
    hammer=rng.standard_normal(n)*np.exp(-x/0.004)*0.3
    return (s+hammer)*np.minimum(1,x/0.002)
def kick():
    n=int(0.5*SR); x=t(n); f=50+120*np.exp(-x/0.04)
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-x/0.18)
def hp(sig,a=0.97):
    y=np.copy(sig); y[1:]=sig[1:]-a*sig[:-1]; return y
def noise(n): return rng.standard_normal(n)
def hat(open_=False):
    n=int((0.35 if open_ else 0.08)*SR); x=t(n)
    s=hp(hp(noise(n),0.99),0.99)
    # metallic partials
    for f in [5400,6800,8200,9700,11800,13900,16200]:
        s+=0.12*np.sin(2*np.pi*f*x+rng.random()*6)
    return s*np.exp(-x/(0.12 if open_ else 0.02))*0.07
def cymbal(dur=2.5):
    n=int(dur*SR); x=t(n); s=hp(hp(noise(n),0.98),0.98)
    for f in rng.uniform(3000,17000,30): s+=0.15*np.sin(2*np.pi*f*x+rng.random()*6)
    return s*np.exp(-x/0.9)*np.minimum(1,x/0.001)*0.09
def ride(): 
    n=int(1.2*SR); x=t(n); s=hp(noise(n),0.99)*0.5
    for f in [3150,4750,6420,8800,11300,14100]: s+=0.3*np.sin(2*np.pi*f*x+rng.random()*6)
    return s*np.exp(-x/0.35)*0.09
def snare():
    n=int(0.3*SR); x=t(n)
    return (hp(noise(n),0.9)*np.exp(-x/0.07)*0.8+np.sin(2*np.pi*190*x)*np.exp(-x/0.05))*0.6
def brush():
    n=int(0.25*SR); x=t(n); return hp(noise(n),0.95)*np.minimum(1,x/0.04)*np.exp(-x/0.1)*0.07
def shaker():
    n=int(0.12*SR); x=t(n); return hp(hp(noise(n),0.99),0.99)*np.sin(np.pi*x/x[-1])**2*0.04
def bass(f,dur):
    n=int(dur*SR); x=t(n); s=np.zeros(n)
    for k in range(1,9): s+=np.sin(2*np.pi*f*k*x)/k**1.6
    return s*env(n,0.01,dur*0.6)*0.7
def saw(f,n,det=0.0):
    x=t(n); ph=(f*(1+det)*x)%1; return 2*ph-1
def pad(freqs,dur):
    n=int(dur*SR); x=t(n); L=np.zeros(n); R=np.zeros(n)
    for f in freqs:
        for d,side in [(-0.004,0),(0.0,2),(0.005,1)]:
            s=saw(f,n,d)
            s=np.convolve(s,np.ones(6)/6,'same')
            if side!=1: L+=s
            if side!=0: R+=s
    e=np.minimum(1,x/0.6)*np.minimum(1,(dur-x)/0.6)
    return np.stack([L*e,R*e],1)*0.06
def bell(f,dur=3):
    n=int(dur*SR); x=t(n); s=np.zeros(n)
    for r,a,dk in [(1,1,1.2),(2.76,0.6,0.8),(5.4,0.4,0.5),(8.93,0.3,0.35),(13.3,0.2,0.2)]:
        if f*r<20000: s+=a*np.sin(2*np.pi*f*r*x)*np.exp(-x/dk)
    return s*np.minimum(1,x/0.001)*0.25
def pluck(f,dur=1.5):
    n=int(dur*SR); N=int(SR/f); buf=rng.uniform(-1,1,N); out=np.zeros(n)
    for i in range(n):
        out[i]=buf[i%N]; buf[i%N]=0.996*0.5*(buf[i%N]+buf[(i+1)%N])
    return out*0.5
def reverb(stereo,mix=0.25,dec=1.4):
    n=int(dec*SR); x=t(n)
    out=np.copy(stereo)
    for c in range(2):
        ir=rng.standard_normal(n)*np.exp(-x/(dec/5)); ir[0]=0
        L=len(stereo)+n; F=1<<(L-1).bit_length()
        wet=np.fft.irfft(np.fft.rfft(stereo[:,c],F)*np.fft.rfft(ir,F),F)[:len(stereo)]
        out[:,c]+=wet/np.max(np.abs(wet)+1e-9)*np.max(np.abs(stereo[:,c]))*mix
    return out
def finish(buf,name):
    buf=reverb(buf)
    buf/=np.max(np.abs(buf))*1.12
    pcm=(np.clip(buf,-1,1)*32767).astype('<i2')
    with wave.open(name,'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(name)
DUR=14
# 1 lo-fi piano + brushes, 80bpm
b=np.zeros((DUR*SR+SR*3,2)); beat=60/80
prog=[[57,60,64,67],[53,57,60,64],[55,59,62,65],[52,55,59,64]]
for bar in range(5):
    ch=prog[bar%4]
    for i,m in enumerate(ch): place(b,piano(midi(m),2.6),bar*4*beat+i*0.02,pan=-0.3+0.2*i,gain=0.35)
    place(b,piano(midi(ch[0]-12),2.6),bar*4*beat,gain=0.4)
    for q in range(8): place(b,brush(),bar*4*beat+q*beat/2,pan=0.4,gain=1)
    for q in range(4): place(b,hat(),bar*4*beat+q*beat+beat/2,pan=0.5,gain=0.6)
    mel=[ch[2]+12,ch[3]+12,ch[1]+12,ch[2]+12]
    for q,m in enumerate(mel): place(b,piano(midi(m),1.4,1.4),bar*4*beat+q*beat+0.5*beat,pan=0.2,gain=0.3)
finish(b[:DUR*SR],'t1.wav')
# 2 pop groove 110bpm
b=np.zeros((DUR*SR+SR*3,2)); beat=60/110
prog=[45,41,43,40]
for bar in range(7):
    r=prog[bar%4]; bt=bar*4*beat
    for q in range(4): place(b,kick(),bt+q*beat,gain=0.9)
    for q in [1,3]: place(b,snare(),bt+q*beat,gain=0.8)
    for q in range(8): place(b,hat(q%4==3),bt+q*beat/2,pan=0.35,gain=0.8)
    if bar%2==0: place(b,cymbal(),bt,pan=-0.4,gain=0.9)
    for q in range(8): place(b,bass(midi(r-12),beat/2*0.9),bt+q*beat/2,gain=0.8)
    p=pad([midi(r+12),midi(r+16),midi(r+19)],4*beat+0.3); s=int(bt*SR); e=min(len(b),s+len(p)); b[s:e]+=p[:e-s]
finish(b[:DUR*SR],'t2.wav')
# 3 acoustic pluck + shaker 96bpm
b=np.zeros((DUR*SR+SR*3,2)); beat=60/96
prog=[[52,59,64,67,71],[48,55,60,64,67],[50,57,62,66,69],[47,54,59,62,66]]
for bar in range(6):
    ch=prog[bar%4]; bt=bar*4*beat
    pat=[0,2,1,3,4,3,2,1]
    for q,i in enumerate(pat): place(b,pluck(midi(ch[i]),1.6),bt+q*beat/2,pan=-0.5+0.25*i,gain=0.9)
    for q in range(16): place(b,shaker(),bt+q*beat/4,pan=0.6,gain=1 if q%2==0 else 0.6)
    place(b,bass(midi(ch[0]-12),4*beat),bt,gain=0.5)
finish(b[:DUR*SR],'t3.wav')
# 4 ambient pad + bells
b=np.zeros((DUR*SR+SR*4,2))
for k,chord in enumerate([[50,57,62,66],[47,54,59,62],[43,50,55,59],[45,52,57,61]]):
    p=pad([midi(m) for m in chord],4.2); s=int(k*3.5*SR); e=min(len(b),s+len(p)); b[s:e]+=p[:e-s]*1.4
for i in range(18):
    m=rng.choice([74,78,81,83,86,88,90]); place(b,bell(midi(m)),0.3+i*0.75+rng.random()*0.2,pan=rng.uniform(-0.8,0.8),gain=0.6)
for i in range(28): place(b,hat(True),i*0.5,pan=0.7,gain=0.25)
finish(b[:DUR*SR],'t4.wav')
# 5 jazz trio 140bpm swing
b=np.zeros((DUR*SR+SR*3,2)); beat=60/140
walk=[38,41,43,45,46,45,43,41,36,40,43,45,47,45,43,40]
for i in range(int(DUR/beat)):
    bt=i*beat
    place(b,bass(midi(walk[i%16]),beat*0.95),bt,pan=-0.1,gain=1.0)
    place(b,ride(),bt,pan=0.5,gain=0.9)
    if i%2==1: place(b,ride(),bt+beat*0.66,pan=0.5,gain=0.5); place(b,hat(),bt,pan=0.6,gain=0.5)
    if i%4 in (1,3) and rng.random()<0.8:
        root=walk[(i//4*4)%16]+12
        for j,iv in enumerate([4,10,14]): place(b,piano(midi(root+iv),0.9),bt+beat*0.66+j*0.01,pan=-0.4,gain=0.3)
finish(b[:DUR*SR],'t5.wav')
