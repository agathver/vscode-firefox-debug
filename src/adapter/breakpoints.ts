import { Log } from '../util/log';
import { DebugProtocol } from 'vscode-debugprotocol';
import { ThreadActorProxy } from '../firefox/index';
import { SourceAdapter, BreakpointAdapter } from '../adapter/index';

let log = Log.create('BreakpointsAdapter');

export class BreakpointsAdapter {

	public static setBreakpointsOnSourceActor(breakpointsToSet: DebugProtocol.SourceBreakpoint[], sourceAdapter: SourceAdapter, threadActor: ThreadActorProxy): Promise<BreakpointAdapter[]> {
		return threadActor.runOnPausedThread((resume) => 
			this.setBreakpointsOnPausedSourceActor(breakpointsToSet, sourceAdapter, resume));
	}

	private static setBreakpointsOnPausedSourceActor(breakpointsToSet: DebugProtocol.SourceBreakpoint[], sourceAdapter: SourceAdapter, resume: () => void): Promise<BreakpointAdapter[]> {

		log.debug(`Setting ${breakpointsToSet.length} breakpoints for ${sourceAdapter.actor.url}`);
		
		let result = new Promise<BreakpointAdapter[]>((resolve, reject) => {

			sourceAdapter.currentBreakpoints.then(
				
				(oldBreakpoints) => {

					log.debug(`${oldBreakpoints.length} breakpoints were previously set for ${sourceAdapter.actor.url}`);

					let newBreakpoints: BreakpointAdapter[] = [];
					let breakpointsBeingRemoved: Promise<void>[] = [];
					let breakpointsBeingSet: Promise<void>[] = [];
					
					oldBreakpoints.forEach((breakpointAdapter) => {
						
						let breakpointIndex = -1;
						for (let i = 0; i < breakpointsToSet.length; i++) {
							if ((breakpointsToSet[i] !== undefined) && 
								(breakpointsToSet[i].line === breakpointAdapter.requestedBreakpoint.line)) {
								breakpointIndex = i;
								break;
							}
						}
						
						if (breakpointIndex >= 0) {
							newBreakpoints[breakpointIndex] = breakpointAdapter;
							breakpointsToSet[breakpointIndex] = undefined;
						} else {
							breakpointsBeingRemoved.push(breakpointAdapter.actor.delete());
						}
					});

					breakpointsToSet.map((requestedBreakpoint, index) => {
						if (requestedBreakpoint !== undefined) {

							breakpointsBeingSet.push(
								sourceAdapter.actor
								.setBreakpoint({ line: requestedBreakpoint.line }, requestedBreakpoint.condition)
								.then((setBreakpointResult) => {

									let actualLine = (setBreakpointResult.actualLocation === undefined) ? 
										requestedBreakpoint.line : 
										setBreakpointResult.actualLocation.line;

									newBreakpoints[index] = new BreakpointAdapter(requestedBreakpoint, actualLine, setBreakpointResult.breakpointActor); 
								}));
						}
					});
					
					log.debug(`Adding ${breakpointsBeingSet.length} and removing ${breakpointsBeingRemoved.length} breakpoints`);

					Promise.all(breakpointsBeingRemoved).then(() => 
					Promise.all(breakpointsBeingSet)).then(
						() => {
							resolve(newBreakpoints);
							resume();
						},
						(err) => {
							log.error(`Failed setting breakpoints: ${err}`);
							reject(err);
							resume();
						});
				});
		});
		
		sourceAdapter.currentBreakpoints = result;
		return result;
	}

} 