const { assert, expect } = require("chai")
const { developmentChains,networkConfig } = require("../../helper-hardhat-config")
const { getNamedAccounts, deployments, ethers, network, } = require("hardhat")

!developmentChains.includes(network.name) ? describe.skip : describe("Raffle unit tests", async function() {
  let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
  const chainId = network.config.chainId

  beforeEach( async function() {
    deployer = (await getNamedAccounts()).deployer
    await deployments.fixture(["all"])
    raffle = await ethers.getContract("Raffle", deployer)
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
    raffleEntranceFee = await raffle.getEntranceFee()
    interval = await raffle.getInterval()
  })

  describe("constructor", function() {
    it("initializes the raffle correectly", async function() {
      const raffleState = await raffle.getRaffleState()
      assert.equal(raffleState, "0")
      assert.equal(interval.toString(),networkConfig[chainId]["interval"])
    })
  })

  describe("enterRaffle", function() {
    it("reverts when you don't pay enough", async function() { 
        await expect(raffle.enterRaffle({value: 0})).to.be.revertedWithCustomError(raffle, "Raffle__NotEnoughETHEntered")
          })
    it("records players when they enter", async function () {
      await raffle.enterRaffle({value: raffleEntranceFee})
      const playerFromContract = await raffle.getPlayer(0)
      assert.equal(playerFromContract, deployer)
    })
    it('emits event on enter', async function() {
      const tx = await raffle.enterRaffle({value: raffleEntranceFee})
      await expect(tx).to.emit(raffle, "RaffleEnter")  
    })
    it("doesn't allow entrance when raffle is calculating", async function() {
      await raffle.enterRaffle({value: raffleEntranceFee})
      await network.provider.send("evm_increaseTime", [Number(interval) + 1])
      await network.provider.request({method: "evm_mine", params: []})
      //We pretend to be a Chainlink Keeper
      await raffle.performUpkeep("0x")
      await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
    })
    describe("checkUpkeep", function() {
      it("returns false if people haven't send any ETH", async function() {
        await network.provider.send("evm_increaseTime", [Number(interval) + 1])
        await network.provider.request({method: "evm_mine", params: []})
        const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
        assert(!upkeepNeeded)
      })
      it("returns false if raffle isn't open", async function() {
        await raffle.enterRaffle({value: raffleEntranceFee})
        await network.provider.send("evm_increaseTime", [Number(interval) + 1])
        await network.provider.request({method: "evm_mine", params: []})
        await raffle.performUpkeep("0x")
        const raffleState = await raffle.getRaffleState()
        const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
        assert.equal(raffleState.toString(), "1")
        assert.equal(upkeepNeeded, false)
      })
      it("returns false if enough time hasn't passed", async function() {
        await raffle.enterRaffle({value: raffleEntranceFee })
        await network.provider.send("evm_increaseTime", [Number(interval) - 3])
        await network.provider.request({method: "evm_mine", params: []})
        const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
        assert(!upkeepNeeded)
      })
      it("returns true if enough time has passed, has players, eth, and is open", async function() {
        await raffle.enterRaffle({value: raffleEntranceFee })
        await network.provider.send("evm_increaseTime", [Number(interval) + 1])
        await network.provider.request({method: "evm_mine", params: []})
        const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
        assert(upkeepNeeded)
      })
    })
    describe("performUpkeep", function() {
      it("it can only run if checkupkeep is true", async function() {
        await raffle.enterRaffle({value: raffleEntranceFee})
        await network.provider.send("evm_increaseTime", [Number(interval) + 1])
        await network.provider.request({method: "evm_mine", params: []})
        const tx = await raffle.performUpkeep("0x")
        assert(tx)
      })
      it("reverts when checkupkeep is false", async function() {
        await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(raffle, "Raffle__UpkeepNotNeeded" )
      })
      it('updates the raffle state, emits an event, and calls the vrf coordinator', async function() {
        await raffle.enterRaffle({value: raffleEntranceFee})
        await network.provider.send("evm_increaseTime", [Number(interval) + 1])
        await network.provider.request({method: "evm_mine", params: []})
        const txResponse = await raffle.performUpkeep("0x")
        const txReceipt = await txResponse.wait(1)
        const requestId = txReceipt.logs[1].args.requestId   
        console.log(requestId)
        const raffleState = await raffle.getRaffleState()
        assert(Number(requestId) > 0)
        assert(raffleState.toString() == "1")
      })
    })
    describe("fulfilRandomWords", function() {
      beforeEach(async function() {
        await raffle.enterRaffle({value: raffleEntranceFee})
        await network.provider.send("evm_increaseTime", [Number(interval) + 1])
        await network.provider.request({method: "evm_mine", params: []})
      })
      it('can only be called after performUpkeep', async function() {
        await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target)).to.be.revertedWith("nonexistent request")
        await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target)).to.be.revertedWith("nonexistent request")
      })
      it("picks a winner, resets the lottery, and sends money",async function() {
        const additionalEntrants = 3
        const startingAccountIndex = 2 //deployer = 0 
        let startingBalance
        const accounts = await ethers.getSigners()
        for(let i = startingAccountIndex; i< startingAccountIndex + additionalEntrants; i++){
          const accountConnectedRaffle = raffle.connect(accounts[i])
          await accountConnectedRaffle.enterRaffle({value: raffleEntranceFee})
        }
        const startingTimeStamp = await raffle.getLatestTimeStamp()





        

        //performUpkeep(mock being chainlink keepers)
        //fulfill random words (mock being the chainlink vrf)
        //we will have to wait for the fulfillRandomWords to be called
        



         await new Promise(async (resolve, reject) => {

          raffle.once("WinnerPicked", async () => {
            console.log("found the event")
            
            try {
              const recentWinner = await raffle.getRecentWinner()
              console.log(recentWinner)
              console.log(accounts[2].address)
              console.log(accounts[0].address)
              console.log(accounts[1].address)
              console.log(accounts[3].address)
              const raffleState = await raffle.getRaffleState()
              const endingTimeStamp = await raffle.getLatestTimeStamp()
              const numPlayers = await raffle.getNumberOfPlayers()
              const winnerEndingBalance = await ethers.provider.getBalance(accounts[2])
              assert.equal(numPlayers.toString(), "0")
              assert.equal(raffleState.toString(), "0")
              assert(endingTimeStamp> startingTimeStamp)
              
              assert.equal(winnerEndingBalance.toString(), (winnerStartingBalance + (raffleEntranceFee * BigInt(additionalEntrants)) + (raffleEntranceFee)).toString())

              resolve()

            } catch (error) {
              reject(error)
            }
            
          })
          //setting up the listener
          //below, we will fir the event, and the listener will pick it up, and resolve
          const tx = await raffle.performUpkeep("0x")
          const txReceipt = await tx.wait(1)
          const winnerStartingBalance = await ethers.provider.getBalance(accounts[2].address)
          await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.logs[1].args.requestId, raffle.target)
          console.log(txReceipt.logs)
          
        })
      })
    })
  })
})
