import re,sys,os
BASE=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','site','data','repertoires')+'/'
def reuse(srcrep, dstrep, pairs, S=None):
    base=BASE
    fr=open(base+srcrep+'.js').read(); en=open(base+'en/'+srcrep+'.js').read()
    outfr='';outen=''
    for src,nid in pairs:
        m=re.search(r"  \{\n    id: '"+re.escape(src)+r"'.*?\n  \},\n", fr, re.S); b=m.group(0)
        b=b.replace("id: '"+src+"', rep: '"+srcrep+"'","id: '"+nid+"', rep: '"+dstrep+"'"); assert nid in b
        outfr+=b
        m=re.search(r"  '"+re.escape(src)+r"': \{.*?\n  \},\n", en, re.S); outen+=m.group(0).replace("'"+src+"':","'"+nid+"':")
    for p,add,end in [(base+dstrep+'.js',outfr,'];'),(base+'en/'+dstrep+'.js',outen,'};')]:
        s=open(p).read(); i=s.rstrip().rfind(end); open(p,'w').write(s[:i]+add+end+'\n')
