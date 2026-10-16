# استخراج فيديوهات قائمة تشغيل يوتيوب: python3 tools/yt_playlist.py <playlist_id> out.json
import json,sys,subprocess
def post(body):
    r=subprocess.run(['curl','-sS','-m','40','-X','POST','https://youtubei.googleapis.com/youtubei/v1/browse?prettyPrint=false','-H','Content-Type: application/json','-d',json.dumps(body)],capture_output=True,text=True)
    return json.loads(r.stdout)
CTX={"client":{"clientName":"WEB","clientVersion":"2.20241010.00.00","hl":"ar"}}
def walk(o,out,conts):
    if isinstance(o,dict):
        if 'lockupViewModel' in o:
            l=o['lockupViewModel']; t=l.get('metadata',{}).get('lockupMetadataViewModel',{}).get('title',{}).get('content','')
            meta=[]
            for row in l.get('metadata',{}).get('lockupMetadataViewModel',{}).get('metadata',{}).get('contentMetadataViewModel',{}).get('metadataRows',[]):
                for p in row.get('metadataParts',[]): meta.append(p.get('text',{}).get('content',''))
            out.append((l.get('contentId'),t,' · '.join(meta)))
        if 'playlistVideoRenderer' in o:
            v=o['playlistVideoRenderer']; out.append((v['videoId'],''.join(r['text'] for r in v['title'].get('runs',[])),''))
        if 'continuationCommand' in o and 'token' in o['continuationCommand'] and o['continuationCommand'].get('request','')!='CONTINUATION_REQUEST_TYPE_REEL_WATCH_SEQUENCE': conts.append(o['continuationCommand']['token'])
        for v in o.values(): walk(v,out,conts)
    elif isinstance(o,list):
        for v in o: walk(v,out,conts)
pid=sys.argv[1]; out=[]; conts=[]
walk(post({"context":CTX,"browseId":"VL"+pid}),out,conts)
seen=set()
while conts:
    c=conts.pop(0)
    if c in seen: continue
    seen.add(c); walk(post({"context":CTX,"continuation":c}),out,conts)
uniq={}
for i,t,m in out:
    if i and i not in uniq: uniq[i]=(t,m)
json.dump([{'id':i,'title':t,'meta':m} for i,(t,m) in uniq.items()],open(sys.argv[2],'w'),ensure_ascii=False,indent=0)
print(sys.argv[2],len(uniq))
