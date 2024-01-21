const { assert, expect } = require("chai")
const { developmentChains,networkConfig } = require("../../helper-hardhat-config")
const { getNamedAccounts, deployments, ethers, network, } = require("hardhat")


developmentChains.includes(network.name) ? describe.skip : describe("Raffle staging tests", async function() {
  
  let raffle, raffleEntranceFee,gasused, gasprice, deployer, winnerStartingBalance

  beforeEach( async function() {
    deployer = (await getNamedAccounts()).deployer
    raffle = await ethers.getContract("Raffle", deployer)
    raffleEntranceFee = await raffle.getEntranceFee()
  })


  describe("fulfilRandomWords", function() {
    it("works with live CHainlink Keepers and Chainlink VRF, we get a random winner", async function () {
      //enter the raffle
      const startingTimeStamp = await raffle.getLatestTimeStamp()
      const accounts = await ethers.getSigners()

      await new Promise(async (resolve, reject) => {
        raffle.once("WinnerPicked", async () => {
          console.log("WinnerPicked event fired!")
          try {



            const recentWinner = await raffle.getRecentWinner()
            const raffleState = await raffle.getRaffleState()
            const winnerEndingBalance = await ethers.provider.getBalance(accounts[0].address)
            console.log(await ethers.provider.estimateGas())
            const endingTimeStamp = await raffle.getLatestTimeStamp()

            await expect(raffle.getPlayer(0)).to.be.reverted
            console.log("reverted")
            assert.equal(recentWinner.toString(), accounts[0].address)
            assert.equal(raffleState, 0)
            //assert.equal(winnerEndingBalance.toString(), (winnerStartingBalance + raffleEntranceFee).toString())
            console.log((winnerEndingBalance + (gasprice * gasused)).toString() + "~" + (winnerStartingBalance + raffleEntranceFee).toString())
            assert(endingTimeStamp > startingTimeStamp)
            resolve()
            
          } catch (error) {
            reject(error)
          }
        })


        const response = await raffle.enterRaffle({value: raffleEntranceFee })
        const txReceipt = await response.wait(1)
        const gasprice = await txReceipt.gasPrice()
        const gasused = await txReceipt.gasUsed()
        console.log(gasprice + gasused)
        winnerStartingBalance = await ethers.provider.getBalance(accounts[0].address)
        console.log("winner starting balance " + winnerStartingBalance)
      })
    })
  })
})
