import importlib.util
import json
from pathlib import Path
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import unittest

spec=importlib.util.spec_from_file_location('bridge',Path(__file__).parents[1]/'companion/brain_bridge.py')
bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)

class Model(BaseHTTPRequestHandler):
    output='{"task":"repair"}'
    request=None
    def log_message(self,*args):pass
    def do_POST(self):
        Model.request=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        value=json.dumps({'choices':[{'message':{'content':Model.output}}]}).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(value)

class TestBrain(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=HTTPServer(('127.0.0.1',0),Model)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        Model.output='{"task":"repair"}'
        self.config={'default':{'base_url':f'http://127.0.0.1:{self.server.server_port}/v1','model':'tiny-test'}}
        self.character={'id':'peg','role':'Carpenter','trait':'Grumpy','ordinary':['repair','forage','rest'],'fatigue':5,'preferences':{'repair':.7},'memories':[]}
        self.context={'ownerId':'alice','emergency':False,'nearbyEnemies':[],'ship':{'directive':'prosper','hull':50,'maxHull':100,'food':50,'timber':20,'ammo':20,'destination':None}}
    def test_openai_protocol_and_private_memory(self):
        result=bridge.decision(self.context,self.character,self.config)
        self.assertEqual(result['task'],'repair');self.assertEqual(Model.request['model'],'tiny-test')
        self.assertNotIn('STARHERMIT',json.dumps(Model.request));self.assertEqual(Model.request['response_format'],{'type':'json_object'})
    def test_bad_json_does_not_become_a_command(self):
        Model.output='Fire all the cannons!';self.assertIsNone(bridge.decision(self.context,self.character,self.config))
    def test_off_role_decision_refused_locally(self):
        Model.output='{"task":"guns"}';self.assertIsNone(bridge.decision(self.context,self.character,self.config))
    def test_emergency_decision_contains_officer_warrant(self):
        self.context['emergency']=True;Model.output='{"task":"guns"}'
        result=bridge.decision(self.context,self.character,self.config);self.assertTrue(result['override']);self.assertEqual(result['issuer'],'brisk')
    def test_per_character_endpoint_model_and_prompt(self):
        self.config['crew']={'peg':{'model':'pegs-brain','system_prompt':'Protect my timbers.'}}
        bridge.decision(self.context,self.character,self.config);self.assertEqual(Model.request['model'],'pegs-brain');self.assertIn('Protect my timbers.',Model.request['messages'][0]['content'])
    def test_instinct_mode_makes_no_call(self):
        self.config['crew']={'peg':{'mode':'instinct'}};self.assertIsNone(bridge.decision(self.context,self.character,self.config))
    def test_browser_mode_never_calls_localhost(self):
        self.config={'default':{'mode':'browser'}}
        self.assertIsNone(bridge.decision(self.context,self.character,self.config))

if __name__=='__main__':unittest.main()
