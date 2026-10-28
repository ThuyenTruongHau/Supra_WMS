"""Return takeover with isolated SQL, fake cache/ICS and real business services."""
import logging
import pathlib
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, event, update
from sqlalchemy.orm import Session

from test import test_outbound_auto_manual_services as shared_fixture
from test import test_outbound_remaining_quantity as fixture
from app.modules.masan import masan_auto_service as auto
from app.modules.masan import masan_return_adoption_service as adoption
from app.modules.masan import masan_return_journal as journal
from app.modules.masan.masan_auto_model import OutboundAutoCycle, OutboundAutoCommand
from app.modules.robot.robot_model import RobotTask, TaskStatus
from app.modules.robot.robot_service import task_status_service
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation as Allocation
from app.modules.warehouse.outbound_order.outbound_order_schema import OutboundRobotTaskCreate, AllocationOutboundTaskExecute
from app.modules.warehouse.transaction_history.history_model import Transaction


class ReturnAdoptionTests(unittest.TestCase):
    native_mode = False
    setUp = shared_fixture.ManualServicesAutoTests.setUp
    put = shared_fixture.ManualServicesAutoTests.put
    cache_details = shared_fixture.ManualServicesAutoTests.cache_details
    assign = shared_fixture.ManualServicesAutoTests.assign
    start = shared_fixture.ManualServicesAutoTests.start
    tick = shared_fixture.ManualServicesAutoTests.tick
    cycles = shared_fixture.ManualServicesAutoTests.cycles
    callback = shared_fixture.ManualServicesAutoTests.callback

    def execute(self, task):
        rows = self.db.query(Allocation).filter_by(robot_task_id=task.id).all()
        return fixture.outbound.execute_outbound_task(self.db, OutboundRobotTaskCreate(
            order_id=task.order_id, from_location_id=rows[0].from_location_id,
            to_location_id=rows[0].to_location_id,
            allocations=[AllocationOutboundTaskExecute(allocation_id=row.id) for row in rows]), "auto")

    def manual_return(self, *, legacy=False, confirmed=True, vt=201, display=8):
        self.put("robot_task", id=100, order_id="MANUAL-PICK", quantity=100,
                 process_code="OUT", system_code="Thadosoft", task_order_detail='[{"taskPath":"None"}]')
        self.put("outbound_order_allocation", id=100, outbound_order_detail_id=1, item_stock_id=1,
                 quantity=19, status="initialize", allocation_type="outbound", from_location_id=101, robot_task_id=100)
        self.db.commit()
        if display == 9:
            self.assign(1, "Zone_CC_01", 103)
        fixture.outbound.execute_outbound_task(self.db, OutboundRobotTaskCreate(order_id="MANUAL-PICK",
            from_location_id=101, to_location_id=vt, allocations=[AllocationOutboundTaskExecute(allocation_id=100)]), "auto")
        task_status_service.receive_task_status(self.db, {"orderId":"MANUAL-PICK","status":"8"})
        if confirmed:
            fixture.masan.confirm_allocation_outbound(self.db, 1, auto.configuration(display)[1], {100:19}, "test")
        self.db.commit()
        task = self.db.query(RobotTask).filter(RobotTask.id != 100).one()
        if legacy:
            self.db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).delete()
            self.db.commit()
        self.rpc.reset_mock()
        return task

    def test_takeover_reuses_existing_return_and_leaves_pick_and_confirmation_unchanged(self):
        task = self.manual_return()
        before = (task.id, task.order_id, task.quantity, self.db.get(Allocation,100).quantity)
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.assertEqual((cycle.execution_mode,cycle.pick_task_id,cycle.return_task_id,cycle.phase),
                         ("adopted_return",None,task.id,"returning"))
        self.assertIsNone(self.db.get(Allocation,100).auto_cycle_id)
        self.assertEqual(self.db.query(RobotTask).count(), 2)
        self.assertEqual((task.id,task.order_id,task.quantity,self.db.get(Allocation,100).quantity),before)
        self.assertEqual(self.rpc.call_count,1)
        self.assertEqual(self.rpc.call_args.args[0]["orderId"],task.order_id)
        self.callback(cycle,returning=True)
        self.assertEqual((cycle.phase,self.db.get(ItemStock,1).location_id,self.db.get(ItemStock,1).quantity),
                         ("completed",101,81))
        self.assertFalse(cycle.cache_pending)

    def test_legacy_verification_is_required_audited_idempotent_and_never_sends(self):
        task = self.manual_return(legacy=True)
        self.start(); self.tick()
        self.assertEqual(self.cycles(),[])
        self.assertEqual(auto.status(self.db,1,8)["return_candidates"][0]["state"],"awaiting_verification")
        with self.assertRaisesRegex(ValueError,"Dừng"):
            adoption.verify_unsent(self.db,1,8,task.id,1,"checked ICS")
        auto.stop(self.db,1,8)
        adoption.verify_unsent(self.db,1,8,task.id,1,"checked ICS")
        adoption.verify_unsent(self.db,1,8,task.id,1,"second click")
        command=self.db.query(OutboundAutoCommand).one()
        self.assertEqual((command.verified_unsent_by_id,command.verification_note),(1,"checked ICS"))
        self.assertIsNotNone(command.verified_unsent_at)
        self.rpc.assert_not_called()
        self.start(); self.tick()
        self.assertEqual(self.rpc.call_count,1)

    def test_verification_rejects_wrong_zone_warehouse_empty_note_and_callback(self):
        task=self.manual_return(legacy=True)
        for warehouse,zone,note in [(2,8,"checked"),(1,9,"checked"),(1,8,"  ")]:
            with self.assertRaises(ValueError): adoption.verify_unsent(self.db,warehouse,zone,task.id,1,note)
        self.db.add(TaskStatus(order_id=task.order_id,status="9")); self.db.commit()
        with self.assertRaises(ValueError): adoption.verify_unsent(self.db,1,8,task.id,1,"checked")
        self.rpc.assert_not_called()

    def test_verification_never_clears_unknown(self):
        task=self.manual_return()
        command=self.db.query(OutboundAutoCommand).one(); command.state="unknown"; self.db.commit()
        with self.assertRaises(ValueError): adoption.verify_unsent(self.db,1,8,task.id,1,"checked")
        self.start(); self.tick()
        self.assertEqual(self.cycles(),[])
        self.assertEqual(command.state,"unknown")
        self.rpc.assert_not_called()

    def test_waiting_for_confirmation_remains_manual_then_is_rechecked(self):
        task=self.manual_return(confirmed=False)
        self.start(); self.tick()
        self.assertEqual(self.cycles(),[])
        self.assertIn("CC",auto.status(self.db,1,8)["return_candidates"][0]["message"])
        fixture.masan.confirm_allocation_outbound(self.db,1,"Zone_CC_02",{100:19},"test")
        self.assertIsNone(self.db.get(Allocation,100).auto_cycle_id)
        self.tick()
        self.assertEqual(self.cycles()[0].return_task_id,task.id)

    def test_other_pallet_same_detail_keeps_exact_manual_wait(self):
        self.manual_return()
        self.put("item_stock",id=2,item_id=1,unit_id=1,location_id=101,quantity=3,status="available",is_active=True)
        self.put("outbound_order_allocation",id=200,outbound_order_detail_id=1,item_stock_id=2,
            quantity=1,status="pre_completed",allocation_type="outbound",from_location_id=101,to_location_id=203)
        self.db.commit(); self.start(); self.tick()
        self.assertEqual(self.cycles(),[])
        self.assertIn("cùng detail",auto.status(self.db,1,8)["return_candidates"][0]["message"])
        self.db.get(Allocation,200).status="completed"; self.db.commit(); self.tick()
        self.assertEqual(self.cycles()[0].execution_mode,"adopted_return")

    def test_all_four_pairs_check_rear_front_and_do_not_self_block_reserved(self):
        # Full service execution on each configured pair, independent isolated DBs.
        for display,vt,front in [(8,201,202),(8,203,204),(9,211,212),(9,213,214)]:
            with self.subTest(display=display,vt=vt):
                if vt!=201:
                    self.doCleanups(); self.setUp()
                self.manual_return(vt=vt,display=display)
                self.put("inbound_order",id=1,order_code="BLOCK",warehouse_id=1,created_by_id=1)
                self.put("inbound_order_detail",id=1,inbound_order_id=1,from_location_id=101,to_location_id=front,status="initialize",detail_type="auto")
                self.db.commit(); self.start(display); self.tick(display)
                cycle=self.cycles()[0]
                self.assertEqual(cycle.phase,"ready_to_return")
                self.rpc.assert_not_called()
                self.db.execute(update(fixture.Base.metadata.tables['inbound_order_detail']).values(status='completed'))
                self.db.commit(); self.tick(display)
                self.assertEqual(cycle.phase,"returning")
                self.assertEqual(self.rpc.call_count,1)

    def test_front_returns_work_independently_in_each_pair(self):
        for display,vt in [(8,202),(8,204),(9,212),(9,214)]:
            with self.subTest(vt=vt):
                if vt!=202:
                    self.doCleanups(); self.setUp()
                self.manual_return(vt=vt,display=display)
                self.start(display); self.tick(display)
                self.assertEqual(self.cycles()[0].phase,"returning")
                self.assertEqual(self.rpc.call_count,1)

    def test_stop_after_adoption_allows_existing_execute_without_new_task(self):
        task=self.manual_return()
        with patch.object(auto,"_return",return_value=False): self.start(); self.tick()
        cycle=self.cycles()[0]
        auto.stop(self.db,1,8); self.tick()
        self.rpc.assert_not_called()
        self.execute(task)
        self.assertEqual((self.rpc.call_count,cycle.phase,self.db.query(RobotTask).count()),(1,"returning",2))

    def test_restart_and_repeated_callbacks_do_not_send_or_move_twice(self):
        self.manual_return(); self.start(); self.tick()
        cycle=self.cycles()[0]
        self.db.expire_all(); self.start(); self.tick(); self.tick()
        self.assertEqual(self.rpc.call_count,1)
        self.callback(cycle,returning=True)
        transactions=self.db.query(Transaction).count()
        self.put("item_stock",id=99,item_id=1,unit_id=1,location_id=201,quantity=7,status="available",is_active=True)
        self.db.commit(); self.callback(cycle,returning=True)
        self.assertEqual(self.db.query(Transaction).count(),transactions)
        self.assertEqual(self.db.get(ItemStock,99).location_id,201)

    def test_late_pick_callback_cannot_regress_confirmed_allocations_or_move_stock(self):
        self.manual_return(); self.start(); self.tick(); cycle=self.cycles()[0]
        self.callback(cycle,returning=True)
        self.db.query(TaskStatus).filter_by(order_id="MANUAL-PICK").delete(); self.db.commit()
        task_status_service.receive_task_status(self.db,{"orderId":"MANUAL-PICK","status":"8"})
        self.assertEqual((self.db.get(Allocation,100).status,self.db.get(ItemStock,1).location_id),("completed",101))

    def test_changed_quantity_after_adoption_stops_without_rewriting_manual_data(self):
        task=self.manual_return()
        with patch.object(auto,"_return",return_value=False): self.start(); self.tick()
        self.db.get(ItemStock,1).quantity=80; self.db.commit(); self.tick()
        self.assertEqual(task.quantity,81)
        self.assertEqual(auto.status(self.db,1,8)["state"],"error")
        self.rpc.assert_not_called()

    def test_timeout_is_not_retried_and_zone_cannot_restart(self):
        self.manual_return(); self.rpc.side_effect=TimeoutError("unknown result")
        self.start(); self.tick(); self.tick()
        self.assertEqual(self.rpc.call_count,1)
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state,"unknown")
        with self.assertRaisesRegex(ValueError,"đối soát"): self.start()

    def test_two_workers_cannot_adopt_or_send_twice(self):
        self.manual_return(); self.start()
        def tick():
            with Session(self.engine) as db: auto.tick_zone(db,1,8)
        with ThreadPoolExecutor(max_workers=2) as workers: list(workers.map(lambda _: tick(),range(2)))
        self.assertEqual(len(self.cycles()),1)
        self.assertEqual(self.rpc.call_count,1)

    def test_duplicate_returns_are_reported_without_claiming_one_arbitrarily(self):
        self.manual_return()
        self.put("robot_task",id=200,order_id="DUPLICATE-RETURN",quantity=81,process_code="IN",system_code="Thadosoft",task_order_detail='[]')
        self.put("outbound_order_allocation",id=200,outbound_order_detail_id=1,item_stock_id=1,
                 quantity=81,status="initialize",allocation_type="return",from_location_id=201,to_location_id=101,robot_task_id=200)
        self.db.commit(); self.start(); self.tick()
        self.assertEqual(self.cycles(),[])
        self.assertTrue(all(c['state']=='blocked' for c in auto.status(self.db,1,8)['return_candidates']))
        self.rpc.assert_not_called()

    def use_file_database(self):
        self.db.commit()
        directory=tempfile.TemporaryDirectory(prefix="return-journal-")
        self.addCleanup(directory.cleanup)
        path=pathlib.Path(directory.name)/"test.sqlite"
        with sqlite3.connect(path) as target:
            self.db.connection().connection.driver_connection.backup(target)
        self.db.close()
        engine=create_engine("sqlite+pysqlite:///"+str(path))
        @event.listens_for(engine,"connect")
        def functions(connection,_):
            connection.create_function("regexp_replace",4,lambda value,*_:value or '')
            connection.execute('PRAGMA journal_mode=WAL')
        self.addCleanup(engine.dispose)
        self.db=Session(engine)
        self.addCleanup(self.db.close)

    def test_manual_timeout_preserves_journal_despite_business_rollback(self):
        task_id=self.manual_return().id
        self.use_file_database()
        task=self.db.get(RobotTask,task_id)
        def http(payload):
            with Session(self.db.get_bind()) as observer:
                self.assertEqual(observer.query(OutboundAutoCommand).one().state,"sending")
                self.assertEqual(observer.query(Allocation).filter_by(robot_task_id=task_id).one().status,"initialize")
            raise TimeoutError("manual timeout")
        self.rpc.side_effect=http
        with self.assertRaisesRegex(TimeoutError,"manual timeout"): self.execute(task)
        self.db.expire_all()
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state,"unknown")
        self.assertEqual(self.db.query(Allocation).filter_by(robot_task_id=task_id).one().status,"initialize")
        self.assertEqual(self.db.get(ItemStock,1).quantity,81)

    def test_manual_payload_result_and_callback_are_unchanged_but_journal_updates(self):
        task=self.manual_return()
        self.assertIsNone(self.execute(task))
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state,"accepted")
        self.assertEqual(self.rpc.call_args.args[0]["taskOrderDetail"],[{"taskPath":"NODE-VT21,SOURCE-NODE"}])
        task_status_service.receive_task_status(self.db,{"orderId":task.order_id,"status":"8"})
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state,"completed")
        self.assertEqual(self.cycles(),[])

    def test_no_residual_stock_is_not_adopted_or_returned(self):
        self.manual_return(); self.db.get(ItemStock,1).quantity=0; self.db.commit()
        self.start(); self.tick()
        self.assertEqual(self.cycles(),[])
        self.rpc.assert_not_called()

    def test_unverified_rear_return_blocks_refilling_front_but_other_pair_continues(self):
        self.manual_return(legacy=True)
        self.put("item",id=2,sku="SKU-2",name="Other",base_unit=1,max_quantity=9999,min_quantity=0,warehouse_id=1,supplier="TEST")
        self.put("outbound_order_detail",id=2,outbound_order_id=1,item_id=2,quantity=5,unit="Thung",detail_type="auto",details={"vehicle_no":"TEST"})
        self.put("location",id=105,location_name="SOURCE2",location_code="S2",zone_id=1,warehouse_id=1)
        self.put("item_stock",id=2,item_id=2,unit_id=1,location_id=105,quantity=10,status="available",is_active=True)
        self.db.commit(); self.cache_details([1,2]); self.assign(2,"Zone_CC_02",301)
        self.start(); self.tick()
        self.assertEqual([c.vt_location_id for c in self.cycles()],[203])
        self.assertEqual(self.cycles()[0].execution_mode,"manual_services")

    def test_two_zones_adopt_independently_and_stop_does_not_stop_other_zone(self):
        self.manual_return()
        self.put("location",id=105,location_name="SOURCE2",location_code="S2",zone_id=1,warehouse_id=1)
        self.put("outbound_order_detail",id=2,outbound_order_id=1,item_id=1,quantity=1,unit="Thung",detail_type="auto")
        self.put("item_stock",id=2,item_id=1,unit_id=1,location_id=211,quantity=7,status="available",is_active=True)
        for identifier,kind,start,end,quantity,status in [(200,"outbound",105,211,1,"completed"),(201,"return",211,105,7,"initialize")]:
            self.put("robot_task",id=identifier,order_id=f"ZONE9-{kind}",quantity=quantity,process_code="IN",system_code="Thadosoft",task_order_detail='[]')
            self.put("outbound_order_allocation",id=identifier,outbound_order_detail_id=2,item_stock_id=2,
                quantity=quantity,status=status,allocation_type=kind,from_location_id=start,to_location_id=end,robot_task_id=identifier)
        self.db.commit(); journal.register(self.db,self.db.get(RobotTask,201)); self.db.commit()
        self.start(8); self.start(9); self.tick(8)
        auto.stop(self.db,1,8); self.tick(9)
        self.assertEqual(len(self.cycles()),2)
        self.assertEqual(self.rpc.call_count,2)
        self.assertFalse(auto.status(self.db,1,8)["enabled"])
        self.assertTrue(auto.status(self.db,1,9)["enabled"])

    def test_adopted_return_reserves_its_target_against_new_supply_from_other_zone(self):
        self.manual_return()
        self.put("outbound_order_detail",id=2,outbound_order_id=1,item_id=1,quantity=5,unit="Thung",detail_type="auto",details={"vehicle_no":"TEST"})
        self.put("item_stock",id=2,item_id=1,unit_id=1,location_id=101,quantity=20,status="available",is_active=True)
        self.db.commit(); self.cache_details([1,2]); self.assign(2,"Zone_CC_01",103)
        self.start(8); self.tick(8); self.start(9); self.tick(9)
        self.assertEqual(len(self.cycles()),1)
        self.assertEqual(self.rpc.call_count,1)

    def test_ics_error_or_cancel_stops_owned_return_and_never_auto_restarts(self):
        for status in ('7','3'):
            with self.subTest(status=status):
                if status=='3': self.doCleanups(); self.setUp()
                self.manual_return(); self.start(); self.tick()
                self.callback(self.cycles()[0],status=status,returning=True)
                self.tick()
                self.assertFalse(auto.status(self.db,1,8)["enabled"])
                self.assertEqual(self.rpc.call_count,1)
                with self.assertRaises(ValueError): self.start()

    def test_non_success_ack_stops_owned_return(self):
        self.manual_return(); self.rpc.return_value={"code":500}
        self.start(); self.tick(); self.tick()
        self.assertEqual(self.rpc.call_count,1)
        self.assertEqual(auto.status(self.db,1,8)["state"],"error")

    def test_invalid_route_or_mixed_task_is_not_adopted(self):
        task=self.manual_return()
        row=self.db.query(Allocation).filter_by(robot_task_id=task.id).one()
        row.to_location_id=104; self.db.commit(); self.start(); self.tick()
        self.assertEqual(self.cycles(),[])
        self.assertEqual(auto.status(self.db,1,8)['return_candidates'][0]['state'],'blocked')
        self.rpc.assert_not_called()

    def test_mixed_task_with_first_row_outside_zone_is_reported(self):
        task=self.manual_return()
        self.db.get(Allocation,100).robot_task_id=task.id
        self.db.commit(); self.start(); self.tick()
        candidates=auto.status(self.db,1,8)['return_candidates']
        self.assertEqual(len(candidates),1)
        self.assertEqual(candidates[0]['state'],'blocked')
        self.assertEqual(self.cycles(),[])

    def test_first_return_callback_moves_only_claimed_stock(self):
        self.manual_return(); self.start(); self.tick()
        self.put("item_stock",id=99,item_id=1,unit_id=1,location_id=201,quantity=7,status="available",is_active=True)
        self.db.commit(); self.callback(self.cycles()[0],returning=True)
        self.assertEqual(self.db.get(ItemStock,1).location_id,101)
        self.assertEqual(self.db.get(ItemStock,99).location_id,201)

    def test_restart_marks_interrupted_manual_send_unknown_without_adoption(self):
        self.manual_return()
        command=self.db.query(OutboundAutoCommand).one(); command.state='sending'; self.db.commit()
        self.start(); self.tick()
        self.db.refresh(command)
        self.assertEqual(command.state,'unknown')
        self.assertEqual(self.cycles(),[])
        self.rpc.assert_not_called()

    def test_unmapped_callback_while_claimed_but_unsent_stops_instead_of_sending(self):
        self.manual_return()
        with patch.object(auto,'_return',return_value=False): self.start(); self.tick()
        self.callback(self.cycles()[0],status='9',returning=True)
        self.tick()
        self.assertFalse(auto.status(self.db,1,8)['enabled'])
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state,'unknown')
        self.rpc.assert_not_called()
        with self.assertRaises(ValueError): self.start()

    def test_legacy_validation_error_cannot_become_proof_of_unsent(self):
        task=self.manual_return(legacy=True)
        with self.assertRaises(ValueError):
            fixture.outbound.execute_outbound_task(self.db,OutboundRobotTaskCreate(
                order_id=task.order_id,from_location_id=201,to_location_id=101,
                allocations=[AllocationOutboundTaskExecute(allocation_id=999)]),'auto')
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state,'unknown')
        self.rpc.assert_not_called()

    def test_status_and_verify_api_enforce_scope_and_do_not_call_robot(self):
        from fastapi.testclient import TestClient
        from app.core.database import get_db
        from app.modules.masan.masan_auto_api import router
        task=self.manual_return(legacy=True)
        path=f"/api/v1/masan/outbound-orders/auto-dispatch/returns/{task.id}/verify-unsent"
        endpoint=next(r for r in fixture.app.routes if r.path.endswith('/returns/{task_id}/verify-unsent'))
        user_dependency=next(d.call for d in endpoint.dependant.dependencies if d.name=='user')
        old=dict(fixture.app.dependency_overrides)
        self.addCleanup(lambda: (fixture.app.dependency_overrides.clear(),fixture.app.dependency_overrides.update(old)))
        fixture.app.dependency_overrides[get_db]=lambda:self.db
        client=TestClient(fixture.app)
        self.addCleanup(client.close)
        self.assertIn(client.post(path,json={"warehouse_id":1,"display_zone_id":8,"note":"checked"}).status_code,(401,403))
        fixture.app.dependency_overrides[user_dependency]=lambda:SimpleNamespace(id=1,roles=[],warehouses=[SimpleNamespace(id=1)])
        denied=client.post(path,json={"warehouse_id":2,"display_zone_id":8,"note":"checked"})
        self.assertEqual(denied.status_code,403)
        ok=client.post(path,json={"warehouse_id":1,"display_zone_id":8,"note":"checked ICS"})
        self.assertEqual(ok.status_code,200,ok.text)
        self.assertEqual(ok.json()['return_candidates'][0]['state'],'ready')
        self.rpc.assert_not_called()


if __name__ == "__main__":
    unittest.main()
