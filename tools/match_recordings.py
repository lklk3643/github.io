# مطابقة أسطر assets/data/defenses.json مع فيديوهات master.json / phd.json (من yt_playlist.py) بالاسم والتاريخ والدرجة
import json,re,unicodedata,sys
tr=str.maketrans('٠١٢٣٤٥٦٧٨٩','0123456789')
def N(t):
    t=unicodedata.normalize('NFKC',t or '').translate(tr)
    t=re.sub('[ً-ْـ]','',t)
    t=re.sub('[إأآٱ]','ا',t).replace('ى','ي').replace('ة','ه')
    t=re.sub(r'\bعبد\s+','عبد',t); t=re.sub(r'\bابو\s+','ابو',t); t=re.sub(r'\bال\s+','ال',t)
    return re.sub(r'\s+',' ',t).strip()
def dt(t):
    t=N(t)
    m=re.search(r'(\d{1,2})\s*[_\-/\\.]\s*(\d{1,2})\s*[_\-/\\.]\s*(14\d\d)',t)
    if m: return (int(m[3]),int(m[2]),int(m[1]))
    m=re.search(r'(14\d\d)\s*[_\-/]\s*(\d{1,2})\s*[_\-/]\s*(\d{1,2})',t)
    return (int(m[1]),int(m[2]),int(m[3])) if m else None
STOP={'بن','بنت','ابن','محمد'}  # محمد شائع جداً كاسم أب
def name_of(title):
    t=N(title)
    m=re.search(r'(?:للباحث[هة]?|للطالب[هة]?|الباحث[هة]?)\s*[:/]?\s*(.+?)(?:،|,|\sيوم|\sاليوم|\sبوم|\sبعنوان|$)',t)
    return m[1].strip() if m else ''
def toks(s): return [w for w in N(s).split() if w not in ('بن','بنت','ابن')]
def part(title):
    m=re.search(r'(?:ج|الجزء)\s*(\d)',N(title)); return int(m[1]) if m else 0
vids=[]
for f,lvl in [('master.json','الماجستير'),('phd.json','الدكتوراه')]:
    for x in json.load(open(f)):
        vids.append(dict(x,lvl=lvl,date=dt(x['title']),name=name_of(x['title']),part=part(x['title'])))
rows=json.load(open(sys.argv[1]))['rows']
res=[]
for i,r in enumerate(rows):
    lvl='الدكتوراه' if 'دكتور' in r.get('الدرجة','') else 'الماجستير' if 'ماجست' in r.get('الدرجة','') else ''
    m=re.search(r'(\d{4})\D+(\d{1,2})\D+(\d{1,2})',r.get('التاريخ','')); d=(int(m[1]),int(m[2]),int(m[3])) if m else None
    st=toks(r.get('الطالب','')); first,last=(st[0],st[-1]) if st else ('','')
    cands=[]
    for v in vids:
        vt=toks(v['name']) or toks(v['title'])
        fm=first in vt; lm=len(st)>1 and last in vt
        sc=0
        if fm and lm: sc=3
        elif fm or lm: sc=1
        if not sc: continue
        if v['date']==d: sc+=3
        elif v['date'] and d and abs((v['date'][0]*360+v['date'][1]*30+v['date'][2])-(d[0]*360+d[1]*30+d[2]))<=45: sc+=1
        if lvl and v['lvl']==lvl: sc+=1
        cands.append((sc,v))
    cands.sort(key=lambda x:(-x[0],x[1]['part'] or 9))
    best=cands[0] if cands else None
    res.append((i,r,best,cands[:3]))
ok=[x for x in res if x[2] and x[2][0]>=6]
low=[x for x in res if x[2] and 2<=x[2][0]<4]
mid=[x for x in res if x[2] and 4<=x[2][0]<6]
for tag,L in [('STRONG',ok),('MAYBE',mid),('LOW',low)]:
    print(f'== {tag} {len(L)}')
    for i,r,b,c in L:
        print(f"{i:3} {r.get('التاريخ')} {r.get('الطالب')} [{r.get('الدرجة')}] -> {b[0]} {b[1]['id']} {b[1]['title'][:95]}")
print('== NONE/weak', len(rows)-len(ok)-len(mid))
json.dump({str(i):{'id':b[1]['id'],'score':b[0],'title':b[1]['title'],'parts':[v['id'] for s,v in c if v['name']==b[1]['name'] and v['date']==b[1]['date']]} for i,r,b,c in ok+mid},open('matches.json','w'),ensure_ascii=False,indent=0)
