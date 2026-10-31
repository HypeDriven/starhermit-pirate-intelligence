#!/usr/bin/env python3
"""Master generated Yue FLACs and MOSS WAVs into small, verified game assets."""
import argparse,json,subprocess,hashlib,wave,array,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--yue',type=Path,required=True);p.add_argument('--moss',type=Path,required=True);a=p.parse_args()
def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
def duration(path):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(path)],text=True))
root=Path(__file__).resolve().parents[1]
tracks=[]
for name,title in [('open-sea','The Quarrelsome Sea'),('lantern-harbour','Lanterns at Saltwick'),('black-sails','Black Sails, Brass Guns')]:
 source=a.yue/(name+'.flac');out=root/'music'/(name+'.ogg');source_duration=duration(source);d={'open-sea':34,'lantern-harbour':22,'black-sails':40}[name];fade=3
 # A cyclic crossfade: both ends meet at the same sample of the original.
 decoded=array.array('f',subprocess.check_output(['ffmpeg','-v','error','-t',str(d),'-i',str(source),'-f','f32le','-']))
 peak=max(map(abs,decoded));rms=math.sqrt(sum(v*v for v in decoded)/len(decoded));gain=min(.6/max(.001,peak),.09/max(.001,rms));del decoded
 graph=f'[0:a]volume={gain}[a];[1:a]volume={gain}[b];[a][b]acrossfade=d={fade}:c1=qsin:c2=qsin,atrim=start={d-fade}:end={2*d-2*fade},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st={d-fade-.006}:d=0.006[out]'
 run(['ffmpeg','-y','-v','error','-t',str(d),'-i',str(source),'-t',str(d),'-i',str(source),'-filter_complex',graph,'-map','[out]','-c:a','libvorbis','-q:a','4','-ar','48000','-metadata','title='+title,'-metadata','artist=Pirate Intelligence · original Yue soundtrack',str(out)])
 meta=json.loads((a.yue/(name+'.job.json')).read_text());meta.pop('id',None);meta.update(file='music/'+out.name,title=title,sourceDuration=source_duration,sourceRangeSeconds=[0,d],masteringGain=gain,loopCrossfadeSeconds=fade,duration=duration(out),sha256=hashlib.sha256(out.read_bytes()).hexdigest());tracks.append(meta)
(root/'music/manifest.json').write_text(json.dumps({'schema':1,'generator':'YuE2 BF16 · full ABC planning · 32 sampling steps','tracks':tracks},indent=2)+'\n')
(root/'music/manifest.txt').write_text('\n'.join(t['file']+' | '+t['title']+' | event: '+t['file'].split('/')[-1][:-4]+' | '+t['prompt'] for t in tracks)+'\n')
manifest=json.loads((a.moss/'generation.json').read_text());usage={'cannon-fire':'A ship fires a broadside.','hull-impact':'The player ship takes a heavy hit.','anchor-chain':'The anchor drops on arrival.','sail-hoist':'A new course is ordered.','rowing':'The longboat launches or rows while watched.','timber-chop':'The visible shore party chops timber.','coins':'Trade, contract, expedition or capture awards a reward.','ship-bell':'Damage, fire, danger or other urgent crew warning.','repair-hammer':'A visible repair watch works on a damaged hull; salvage party works.','cutlass':'A boarding action begins.','ocean':'Optional quiet sea ambience loop.','storm':'Weather changes to a squall.','gulls':'Occasional optional harbour ambience.','creaking-deck':'Occasional optional underway deck ambience.'}
for item in manifest:
 name=item['event'];out=root/'sfx'/(name+'.ogg');source=a.moss/(name+'.wav')
 # Trim only outer quiet; an amplitude bound preserves gaps between knocks.
 with wave.open(str(source)) as wav:
  rate=wav.getframerate();channels=wav.getnchannels();samples=array.array('h',wav.readframes(wav.getnframes()))
 threshold=max(50,max(map(abs,samples))*.008)
 first=next((i for i,v in enumerate(samples) if abs(v)>threshold),0)
 last=next((i for i in range(len(samples)-1,-1,-1) if abs(samples[i])>threshold),len(samples)-1)
 start=max(0,first/channels/rate-.03);end=min(duration(source),last/channels/rate+.10)
 if name=='ocean':start=0;end=duration(source)
 length=max(.2,end-start)
 filt='loudnorm=I=-19:TP=-3:LRA=10,afade=t=in:d=0.01,afade=t=out:st='+str(max(.05,length-.06))+':d=0.06'
 if name=='ocean':filt='loudnorm=I=-23:TP=-5:LRA=8,afade=t=in:d=0.3,afade=t=out:st='+str(max(.3,length-.3))+':d=0.3'
 run(['ffmpeg','-y','-v','error','-ss',str(start),'-i',str(source),'-t',str(length),'-af',filt,'-ac','1','-ar','48000','-c:a','libvorbis','-q:a','4',str(out)])
 item.update(file='sfx/'+out.name,usage=usage[name],duration=duration(out),sha256=hashlib.sha256(out.read_bytes()).hexdigest())
(root/'sfx/manifest.json').write_text(json.dumps({'schema':1,'generator':'MOSS-SoundEffect v2 · 80 solver steps · BF16','effects':manifest},indent=2)+'\n')
(root/'sfx/manifest.txt').write_text('\n'.join(e['file']+' | event: '+e['event']+' | '+e['usage']+' | Sounds like: '+e['prompt'] for e in manifest)+'\n')
print('Prepared',len(tracks),'Yue tracks and',len(manifest),'MOSS effects.')
